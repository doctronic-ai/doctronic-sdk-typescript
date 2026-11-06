// One chat in an embed session: sending turns, and the state a chat UI renders from the stream
// (the end of the conversation, safety notices, off-ramps, the rating question).

import type { DeploymentConfig } from './config.js';
import {
  APIError,
  APITimeoutError,
  APIUserAbortError,
  DoctronicError,
  ErrorCode,
  RateLimitError,
  validRetryAfter,
} from './errors.js';
import type { components } from './generated/schema.js';
import {
  isKnownChatStreamEvent,
  toChatStreamEvent,
  type ChatStreamEvent,
  type GuardianCategory,
  type GuardianEvent,
  type KnownChatStreamEvent,
  type SseFrame,
} from './streaming.js';

/** Why a session ended: it expired or was revoked, the deployment was paused, a new session replaced it, or the client was disposed. */
export type SessionEndCause = 'expired' | 'paused' | 'replaced' | 'disposed';

/** Fixed diagnostic codes. A diagnostic never carries chat content, only its code and a count. */
export type DiagnosticCode =
  | 'stream.malformed_frame'
  | 'stream.invalid_event'
  | 'stream.unknown_event'
  | 'session.refresh_failed'
  | 'offramp.link_failed';

/** @internal What a chat needs from its client. */
export interface ChatHost {
  readonly config: DeploymentConfig;
  /** The session generation; it changes when the session ends. */
  generation(): number;
  /** False once the session is gone, after ending it if it expired unnoticed. */
  checkSession(): boolean;
  openStream(chatId: string, userInput: string, signal?: AbortSignal): Promise<OpenStream>;
  getOfframp(chatId: string, kind: string): Promise<Offramp>;
  rate(chatId: string, score: number): Promise<Rating>;
  rateMessage(chatId: string, message: string | null): Promise<Rating>;
  diagnostic(code: DiagnosticCode): void;
}

/** @internal An open turn: its frames, and a way to stop reading. */
export interface OpenStream {
  frames: AsyncIterator<SseFrame>;
  /** Stops reading and closes the connection. */
  cancel(): Promise<void>;
}

/** An off-ramp link. `url` is Doctronic's redirect: it records the click, then opens the destination. */
export type Offramp = components['schemas']['OfframpLinkResponse'];

export type Rating = components['schemas']['RatingResponse'];

/**
 * The copy to show for a guardian. Show `title` and `text` (markdown) when present. Otherwise show
 * `message` when set, which only a `safety` guardian has, else your own copy; for an emergency,
 * your own emergency guidance.
 */
export interface GuardianCopy {
  guardianId: string;
  /** The guardian's category, or `other` for one this version doesn't know. */
  category: GuardianCategory;
  title?: string;
  text?: string;
  message: string;
}

export type ChatEnd =
  /** A guardian ended it. Show its copy prominently; offer no rating or next steps. */
  | ({ reason: 'safety' } & GuardianCopy)
  /** The conversation is over. */
  | { reason: 'ended' }
  /** The session is gone, so the chat can't go on: start a new session and chat. */
  | { reason: 'session_ended'; cause: SessionEndCause };

/** Why the last turn didn't get through. Cleared once the API accepts a turn again. */
export interface Unavailable {
  /**
   * `paused`: the deployment is paused. `rate_limited`: try again after `retryAtMs`. `error`: the
   * turn failed or was cut off; show the deployment's `fallbackContact`.
   */
  reason: 'paused' | 'rate_limited' | 'error';
  code: string;
  /** When the visitor may try again, on this device's clock. Set for `rate_limited`. */
  retryAtMs: number | null;
}

export interface ChatState {
  /** A reply is streaming; `send()` is refused until it finishes. */
  streaming: boolean;
  /** Set once the chat can't go on; `send()` is refused from then on. */
  ended: ChatEnd | null;
  /**
   * A guardian warning that doesn't end the chat, such as an emergency phrase. Show it as a
   * dismissable warning; the conversation continues. Cleared by `dismissNotice()`.
   */
  notice: GuardianCopy | null;
  /** The off-ramps to show now, in the deployment's order. Only grows, until a safety end clears it. */
  offramps: Offramp[];
  /** The chat ended normally, the deployment asks a rating question, and it isn't answered yet. */
  ratingDue: boolean;
  /** The visitor's answer, once given. */
  rating: Rating | null;
  unavailable: Unavailable | null;
}

/** A failed off-ramp link is tried this many times in all, at least this far apart. */
const OFFRAMP_ATTEMPTS = 3;
const OFFRAMP_RETRY_MS = 3_000;

const KNOWN_CATEGORIES: readonly string[] = [
  'emergency',
  'safety',
  'feedback',
  'other',
] satisfies GuardianCategory[];

function category(value: string): GuardianCategory {
  return KNOWN_CATEGORIES.includes(value) ? (value as GuardianCategory) : 'other';
}

function isRateLimit(code: string): boolean {
  return code === ErrorCode.streamRateLimited || code === ErrorCode.rateLimited;
}

function unavailableFor(code: string, retryAfterSeconds: number | null): Unavailable {
  if (code === ErrorCode.paused) return { reason: 'paused', code, retryAtMs: null };
  if (retryAfterSeconds !== null) {
    return { reason: 'rate_limited', code, retryAtMs: Date.now() + retryAfterSeconds * 1000 };
  }
  return { reason: 'error', code, retryAtMs: null };
}

/** A repeat of the same guardian updates the earlier copy and keeps what it leaves empty. */
function guardianCopy(event: GuardianEvent, earlier: GuardianCopy | null): GuardianCopy {
  const previous = earlier?.guardianId === event.guardianId ? earlier : null;
  const kind = category(event.category);
  const copy: GuardianCopy = {
    guardianId: event.guardianId,
    category: kind,
    // The stream parser already emptied `message` for every category but `safety`.
    message: kind === 'safety' ? event.message.trim() || previous?.message || '' : '',
  };
  const title = event.title?.trim() || previous?.title;
  const text = event.text?.trim() || previous?.text;
  if (title) copy.title = title;
  if (text) copy.text = text;
  return copy;
}

/** Refused by this client before any request: the chat is busy, has ended, or the client is gone. */
export class ChatStateError extends DoctronicError {}

/** The stream ended before the turn was answered, or in the middle of a reply. Never resent. */
export class StreamInterruptedError extends DoctronicError {
  constructor() {
    super('The reply was cut off. Check the conversation before sending again.', {
      code: ErrorCode.streamInterrupted,
    });
  }
}

export class Chat {
  readonly id: string;
  readonly config: DeploymentConfig;

  readonly #host: ChatHost;
  readonly #generation: number;
  #state: ChatState = {
    streaming: false,
    ended: null,
    notice: null,
    offramps: [],
    ratingDue: false,
    rating: null,
    unavailable: null,
  };
  readonly #listeners = new Set<(state: ChatState) => void>();
  /** Off-ramp kinds requested or shown, so each is fetched once. */
  readonly #requested = new Set<string>();
  readonly #attempts = new Map<string, number>();
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();
  readonly #ctaWidgets = new Set<string>();
  #assistantReplies = 0;
  #closed = false;
  #active: OpenStream | null = null;
  /** Set when the session ended under a streaming turn, which then stops quietly. */
  #cancelled = false;

  /** @internal Created by `DoctronicBrowser.createChat()`. */
  constructor(host: ChatHost, id: string, generation: number) {
    this.#host = host;
    this.id = id;
    this.config = host.config;
    this.#generation = generation;
  }

  get state(): ChatState {
    return this.#state;
  }

  /** Calls `listener` with the current state now and on every change. Returns an unsubscribe function. */
  subscribe(listener: (state: ChatState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Sends one turn and yields the reply's events as they arrive. A turn is never resent: after an
   * error, read the conversation before sending again. Throws a {@link ChatStateError} while a
   * reply is streaming or once the chat has ended. Breaking out of the loop closes the stream,
   * except after a guardian ended the chat: then the rest is read in the background, so the server
   * can confirm the end.
   */
  async *send(
    userInput: string,
    { signal }: { signal?: AbortSignal } = {},
  ): AsyncGenerator<ChatStreamEvent, void, undefined> {
    this.#host.checkSession();
    if (this.#state.ended) {
      throw new ChatStateError('This chat has ended.', { code: ErrorCode.chatEnded });
    }
    if (this.#state.streaming) {
      throw new ChatStateError('A reply is still streaming.', { code: ErrorCode.chatBusy });
    }
    this.#update({ streaming: true });
    let stream: OpenStream | null = null;
    let done = false;
    try {
      stream = await this.#host.openStream(this.id, userInput, signal);
      const turn = { accepted: false, refused: false, answered: false, errored: false };
      const open = new Set<string>();
      if (this.#cancelled) {
        await stream.cancel();
        return;
      }
      this.#active = stream;
      for (;;) {
        const next = await stream.frames.next();
        // The session ended mid-turn (not a safety end): the rest of the reply is dropped.
        if (this.#cancelled) return;
        if (next.done) break;
        const event = this.#read(next.value, turn, open);
        if (event) yield event;
      }
      done = true;
      if (turn.refused && !turn.accepted) return;
      // The connection closed without answering the turn, or in the middle of a reply. An error
      // event already said why.
      if (!turn.accepted || (!turn.errored && (!turn.answered || open.size > 0))) {
        // `state`, not `#state`: the checks above narrowed `#state.ended`, but events changed it.
        if (!this.state.ended) {
          this.#update({ unavailable: unavailableFor(ErrorCode.streamInterrupted, null) });
        }
        throw new StreamInterruptedError();
      }
    } catch (error) {
      if (this.#cancelled) return;
      this.#failed(error);
      throw error;
    } finally {
      this.#active = null;
      if (stream && !done && !this.#cancelled) {
        if (this.state.ended?.reason === 'safety') void this.#drain(stream);
        else await stream.cancel();
      }
      this.#update({ streaming: false });
    }
  }

  /** Clears the notice. */
  dismissNotice(): void {
    if (this.#state.notice) this.#update({ notice: null });
  }

  /** Answers the deployment's rating question (`config.rating`). Submitting again changes it. */
  async rate(score: number): Promise<Rating> {
    this.#assertCanRate();
    const rating = await this.#host.rate(this.id, score);
    if (!this.#closed) this.#update({ rating, ratingDue: false });
    return rating;
  }

  /** Adds the optional comment to a rated chat, or clears it with `null`. */
  async rateMessage(message: string | null): Promise<Rating> {
    this.#assertCanRate();
    return this.#host.rateMessage(this.id, message);
  }

  /** @internal The session ended: the chat can't go on, and nothing more is fetched for it. */
  sessionEnded(cause: SessionEndCause): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();
    // A turn still streaming when a new session replaces this one is dropped, so the old reply
    // can't run on beside the new chat. One whose session merely expired runs to its end, as it
    // does after a safety end.
    if (this.#state.streaming && cause === 'replaced' && this.#state.ended?.reason !== 'safety') {
      this.#cancelled = true;
      // A turn still opening is closed as soon as its stream arrives.
      if (this.#active) void this.#active.cancel();
    }
    this.#update({
      ended: this.#state.ended ?? { reason: 'session_ended', cause },
      // Answering needs the session.
      ratingDue: false,
    });
  }

  #assertCanRate(): void {
    if (this.#state.ended?.reason === 'safety') {
      throw new ChatStateError('A guardian ended this chat.', { code: ErrorCode.chatEnded });
    }
    if (this.#stale()) {
      throw new ChatStateError("This chat's session has ended.", { code: ErrorCode.chatEnded });
    }
  }

  #read(
    frame: SseFrame,
    turn: { accepted: boolean; refused: boolean; answered: boolean; errored: boolean },
    open: Set<string>,
  ): ChatStreamEvent | null {
    const parsed = toChatStreamEvent(frame);
    if (parsed.kind === 'malformed') {
      this.#host.diagnostic('stream.malformed_frame');
      return null;
    }
    if (parsed.kind === 'invalid') {
      this.#host.diagnostic('stream.invalid_event');
      // A guardian that ends the chat still stops it, even without the fields to show it.
      if (parsed.endsConversation) {
        turn.accepted = turn.answered = true;
        this.#endForSafety({ guardianId: '', category: 'other', message: '' });
      }
      return null;
    }
    const { event } = parsed;
    if (!isKnownChatStreamEvent(event)) {
      this.#host.diagnostic('stream.unknown_event');
      return event;
    }
    // A rate limit as the first event means the API never took the turn.
    if (!turn.accepted && event.type === 'error' && isRateLimit(event.errorCode)) {
      turn.refused = true;
      this.#update({
        unavailable: unavailableFor(
          event.errorCode,
          validRetryAfter(event.retryAfterSeconds, true),
        ),
      });
      return event;
    }
    if (!turn.accepted) {
      turn.accepted = true;
      if (this.#state.unavailable) this.#update({ unavailable: null });
    }
    this.#observe(event, turn, open);
    return event;
  }

  #observe(
    event: KnownChatStreamEvent,
    turn: { answered: boolean; errored: boolean },
    open: Set<string>,
  ): void {
    switch (event.type) {
      case 'message.start':
        if (event.role === 'assistant') {
          open.add(event.messageId);
          turn.answered = true;
        }
        return;
      case 'message.content':
        return;
      case 'message.stop':
        if (open.delete(event.messageId)) {
          this.#assistantReplies += 1;
          this.#evaluateOfframps();
        }
        return;
      case 'skill_code.cta':
        turn.answered = true;
        if (event.widget) this.#ctaWidgets.add(event.widget);
        this.#evaluateOfframps();
        return;
      case 'guardian': {
        turn.answered = true;
        // Whether it ends the chat comes from `endsConversation` alone, never from the category.
        if (event.endsConversation) {
          const ended = this.#state.ended;
          const earlier = ended?.reason === 'safety' ? ended : this.#state.notice;
          this.#endForSafety(guardianCopy(event, earlier));
        } else if (category(event.category) !== 'feedback') {
          this.#update({ notice: guardianCopy(event, this.#state.notice) });
        }
        return;
      }
      case 'conversation.end':
      case 'ai_consultation.complete':
        turn.answered = true;
        if (!this.#state.ended) {
          this.#update({ ended: { reason: 'ended' } });
          // Answering needs the session, so an expired one asks for no rating.
          const live = this.#host.checkSession() && !this.#closed;
          if (live && this.config.rating !== null && this.#state.rating === null) {
            this.#update({ ratingDue: true });
          }
        }
        this.#evaluateOfframps();
        return;
      case 'conversation.offtopic':
        turn.answered = true;
        return;
      case 'error':
        turn.errored = true;
        this.#update({
          unavailable: unavailableFor(
            event.errorCode,
            isRateLimit(event.errorCode) ? validRetryAfter(event.retryAfterSeconds, true) : null,
          ),
        });
        return;
    }
  }

  #endForSafety(copy: GuardianCopy): void {
    // A safety end wins over a plain one, whichever arrives first. No rating or next steps follow
    // it, so links already shown are withdrawn too.
    this.#update({ ended: { reason: 'safety', ...copy }, ratingDue: false, offramps: [] });
  }

  /** Records why a turn failed, so the UI can show the fallback. An abort is the caller's own doing. */
  #failed(error: unknown): void {
    if (error instanceof APIUserAbortError || error instanceof StreamInterruptedError) return;
    if (this.state.ended?.reason === 'safety') return;
    let unavailable: Unavailable;
    if (error instanceof APIError) {
      const wait = error instanceof RateLimitError ? error.retryAfter : null;
      unavailable = unavailableFor(error.code ?? `http.${error.status}`, wait);
    } else if (error instanceof APITimeoutError) {
      unavailable = unavailableFor(ErrorCode.timeout, null);
    } else if (error instanceof DoctronicError && error.code) {
      unavailable = unavailableFor(error.code, null);
    } else {
      unavailable = unavailableFor(ErrorCode.connection, null);
    }
    this.#update({ unavailable });
  }

  #stale(): boolean {
    return this.#closed || this.#host.generation() !== this.#generation;
  }

  #offrampsAllowed(): boolean {
    // Fetching a link needs the session; links already shown are signed redirects and keep working.
    return this.#host.checkSession() && !this.#stale() && this.#state.ended?.reason !== 'safety';
  }

  #evaluateOfframps(): void {
    if (!this.#offrampsAllowed()) return;
    const ended = this.#state.ended !== null;
    for (const { kind, showWhen } of this.config.offramps) {
      if (this.#requested.has(kind)) continue;
      const due =
        showWhen.ctaWidgets.some((widget) => this.#ctaWidgets.has(widget)) ||
        (showWhen.onConversationEnd && ended) ||
        (showWhen.afterAssistantReplies !== null &&
          this.#assistantReplies >= showWhen.afterAssistantReplies);
      if (due) this.#fetchOfframp(kind);
    }
  }

  #fetchOfframp(kind: string): void {
    this.#requested.add(kind);
    this.#host.getOfframp(this.id, kind).then(
      (link) => {
        // A link for a chat that has moved on, or after a safety end, is never shown.
        if (!this.#offrampsAllowed()) return;
        const order = this.config.offramps.map((offramp) => offramp.kind);
        const offramps = [...this.#state.offramps, { ...link, kind }].sort(
          (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind),
        );
        this.#update({ offramps });
      },
      (error: unknown) => {
        if (!this.#offrampsAllowed()) return;
        this.#host.diagnostic('offramp.link_failed');
        const attempts = (this.#attempts.get(kind) ?? 0) + 1;
        this.#attempts.set(kind, attempts);
        if (attempts >= OFFRAMP_ATTEMPTS) return;
        const retryAfter = error instanceof RateLimitError ? error.retryAfter * 1000 : 0;
        const timer = setTimeout(
          () => {
            this.#timers.delete(timer);
            if (this.#offrampsAllowed()) this.#fetchOfframp(kind);
          },
          Math.max(OFFRAMP_RETRY_MS, retryAfter),
        );
        this.#timers.add(timer);
      },
    );
  }

  /**
   * Reads the rest of a turn after a safety end, once the caller stopped listening. Nothing is
   * yielded, but a later guardian still updates the safety copy shown.
   */
  async #drain(stream: OpenStream): Promise<void> {
    try {
      for (;;) {
        const next = await stream.frames.next();
        if (next.done) return;
        const parsed = toChatStreamEvent(next.value);
        if (parsed.kind !== 'event' || !isKnownChatStreamEvent(parsed.event)) continue;
        // Only a guardian can still change what's shown: the chat has ended for safety.
        if (parsed.event.type !== 'guardian') continue;
        this.#observe(parsed.event, { answered: true, errored: false }, new Set());
      }
    } catch {
      // The connection dropped or the client was disposed: there's nothing left to read.
    }
  }

  #update(patch: Partial<ChatState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener(this.#state);
  }
}
