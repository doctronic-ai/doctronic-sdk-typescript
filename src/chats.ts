import type {
  APIPromise,
  IdempotentRequestOptions,
  QueryParams,
  RequestBody,
  RequestOptions,
  ResponseData,
  Transport,
} from './client.js';
import type { components } from './generated/schema.js';
import type { ChatStream } from './streaming.js';

export type Chat = components['schemas']['ChatResponse'];
export type ChatMessage = components['schemas']['MessageResponse'];
export type ChatPage = components['schemas']['Page_ChatResponse_'];
export type ChatMessagePage = components['schemas']['Page_MessageResponse_'];
export type CreateChatParams = RequestBody<'POST /chats/'>;
export type ListChatsParams = QueryParams<'GET /chats/'>;
export type ListChatMessagesParams = QueryParams<'GET /chats/{chatId}/messages/'>;

type StreamRequest = RequestBody<'POST /chats/{chatId}/stream/'>;
type UserMessage = StreamRequest['userEvent'];

/** One patient turn for `chats.stream()`. */
export interface StreamChatParams {
  /** The patient's message. */
  userInput: UserMessage['userInput'];
  /** Context for this turn only. */
  messagePromptContext?: UserMessage['messagePromptContext'];
  /** An IANA timezone. Defaults to `UTC` on the server. */
  timezone?: StreamRequest['timezone'];
  /** Aborts the stream: on caller disconnect, a cancel action, or your own timeout. */
  signal?: AbortSignal | undefined;
  /** How long the server may take to start the stream. Defaults to the client's `timeoutMs`. */
  timeoutMs?: number | undefined;
}

export class ChatsResource {
  readonly #transport: Transport;
  readonly #userId: string;

  /** @internal */
  constructor(transport: Transport, userId: string) {
    this.#transport = transport;
    this.#userId = userId;
  }

  /** `POST /chats/`: open a chat for one consultation. Store the returned `id`. */
  create(
    body: CreateChatParams = {},
    options?: IdempotentRequestOptions,
  ): APIPromise<ResponseData<'POST /chats/', 201>> {
    return this.#transport.request('POST /chats/', { body, userId: this.#userId, options });
  }

  /** `GET /chats/`: the user's chats, newest first by default. */
  list(
    query: ListChatsParams = {},
    options?: RequestOptions,
  ): APIPromise<ResponseData<'GET /chats/', 200>> {
    return this.#transport.request('GET /chats/', { query, userId: this.#userId, options });
  }

  /** `GET /chats/{chatId}/`. */
  retrieve(
    chatId: string,
    options?: RequestOptions,
  ): APIPromise<ResponseData<'GET /chats/{chatId}/', 200>> {
    return this.#transport.request('GET /chats/{chatId}/', {
      pathParams: { chatId },
      userId: this.#userId,
      options,
    });
  }

  /** `GET /chats/{chatId}/messages/`: the transcript, oldest first by default. */
  messages(
    chatId: string,
    query: ListChatMessagesParams = {},
    options?: RequestOptions,
  ): APIPromise<ResponseData<'GET /chats/{chatId}/messages/', 200>> {
    return this.#transport.request('GET /chats/{chatId}/messages/', {
      pathParams: { chatId },
      query,
      userId: this.#userId,
      options,
    });
  }

  /**
   * `POST /chats/{chatId}/stream/`: send one patient turn and read the reply as typed events.
   *
   * Resolves once the server accepts the turn, and rejects with a typed error for the JSON errors
   * before the stream starts, such as `409 error.partner.chat_stream_in_progress` or
   * `503 error.partner.chat_stream_unavailable`. After that, an `error` event arrives as an event.
   *
   * The turn takes no idempotency key, so it is never retried. After a failure, read
   * `messages()` before you let the patient resend.
   */
  stream(chatId: string, params: StreamChatParams): APIPromise<ChatStream> {
    const { userInput, messagePromptContext, timezone, signal, timeoutMs } = params;
    const body: StreamRequest = {
      userEvent: { type: 'user_message', userInput, messagePromptContext },
      timezone,
    };
    return this.#transport.stream('POST /chats/{chatId}/stream/', {
      pathParams: { chatId },
      body,
      userId: this.#userId,
      options: { signal, timeoutMs },
    });
  }
}
