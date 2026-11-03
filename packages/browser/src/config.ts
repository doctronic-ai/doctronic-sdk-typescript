// The deployment's public config (`GET /embed/config/`), the intake's state step, and attribution.
// The types come from the contract; the config gets the contract's defaults filled in, so each
// field the contract defaults is always there.

import { isRecord } from './errors.js';
import type { components } from './generated/schema.js';

type Schemas = components['schemas'];

export type Sex = Schemas['Sex'];
/** A two-letter US state or DC code. */
export type StateCode = Schemas['State'];
export type Theme = Schemas['EmbedTheme'];
export type StarterPrompt = Schemas['EmbedStarterPrompt'];
export type StateSelection = Schemas['StateSelection'];
export type StateDisclaimer = Schemas['StateDisclaimer'];
export type RatingConfig = Schemas['EmbedRatingConfig'];
export type ArtifactType = Schemas['ArtifactType'];
export type Platform = Schemas['EmbedPlatform'];

/** The deployment's copy. `inputPlaceholder` and `starterPrompts` have the contract's defaults. */
export type Copy = Schemas['EmbedCopy'] &
  Required<Pick<Schemas['EmbedCopy'], 'inputPlaceholder' | 'starterPrompts'>>;

/** The intake rules, with the contract's defaults. Read `state` with {@link stateStep}. */
export interface IntakeRules {
  minAge: number;
  state: StateSelection | StateDisclaimer | null;
  /** The visitor's roles (e.g. patient, caregiver) to pick from, or `null` when not asked. */
  roles: string[] | null;
  ineligibleMessage: string;
}

/** When to show an off-ramp. Any matching condition shows it; once shown it stays. */
export type OfframpTrigger = Required<Schemas['EmbedOfframpTrigger']>;

export interface OfframpConfig {
  kind: string;
  label: string;
  showWhen: OfframpTrigger;
}

/** `GET /embed/config/`, with the contract's defaults filled in. */
export interface DeploymentConfig {
  deploymentId: string;
  partnerId: string;
  configVersion: string;
  allowedOrigins: string[];
  theme: Theme;
  content: Copy;
  intake: IntakeRules;
  offramps: OfframpConfig[];
  /** The end-of-chat question, or `null` when the deployment asks none. */
  rating: RatingConfig | null;
  /** Consultation documents the visitor isn't shown. This client never exposes any. */
  hiddenArtifacts: ArtifactType[];
  hideSoapNote: boolean;
  /** `true` while the deployment is paused: new sessions are refused with `error.embed.paused`. */
  paused: boolean;
}

/** The contract's defaults for the fields it marks optional. */
const DEFAULT_MIN_AGE = 18;
const DEFAULT_INELIGIBLE_MESSAGE = "Sorry, this service isn't available to you yet.";
const DEFAULT_INPUT_PLACEHOLDER = 'Ask anything about your health';

/** @internal Fills in the contract's defaults. */
export function withConfigDefaults(config: Schemas['EmbedConfigResponse']): DeploymentConfig {
  const intake: Partial<Schemas['EmbedIntake']> = config.intake ?? {};
  return {
    ...config,
    content: {
      ...config.content,
      inputPlaceholder: config.content.inputPlaceholder ?? DEFAULT_INPUT_PLACEHOLDER,
      starterPrompts: config.content.starterPrompts ?? [],
    },
    intake: {
      ...intake,
      minAge: intake.minAge ?? DEFAULT_MIN_AGE,
      // Kept as sent, unknown or not: stateStep() decides what to do with it.
      state: intake.state ?? null,
      roles: intake.roles ?? null,
      ineligibleMessage: intake.ineligibleMessage ?? DEFAULT_INELIGIBLE_MESSAGE,
    },
    offramps: (config.offramps ?? []).map(({ kind, label, showWhen }) => ({
      kind,
      label,
      showWhen: {
        ctaWidgets: showWhen?.ctaWidgets ?? [],
        onConversationEnd: showWhen?.onConversationEnd ?? false,
        afterAssistantReplies: showWhen?.afterAssistantReplies ?? null,
      },
    })),
    rating: config.rating ?? null,
    hiddenArtifacts: config.hiddenArtifacts ?? [],
    paused: config.paused ?? false,
  };
}

/**
 * The state step to show, from the deployment's intake rules:
 * - `selection`: ask for one of `states` (the server refuses others), in the deployment's
 *   `question` when it has one.
 * - `disclaimer`: show `text` with the terms; collect no state.
 * - `none`: no state step.
 * - `unsupported`: a rule this version doesn't know. Eligibility is contractual, so don't start a
 *   session; `startSession()` refuses to.
 */
export type StateStep =
  | { mode: 'selection'; states: StateCode[]; question?: string }
  | { mode: 'disclaimer'; states: StateCode[]; text: string }
  | { mode: 'none' }
  | { mode: 'unsupported' };

export function stateStep(intake: IntakeRules | Schemas['EmbedIntake']): StateStep {
  const rule: unknown = intake.state;
  // A Partners API that predates `state` sends `allowedStates`: a list means a selection.
  if (rule === undefined) {
    const legacy: unknown = (intake as { allowedStates?: unknown }).allowedStates;
    if (legacy == null) return { mode: 'none' };
    return isStateList(legacy) ? { mode: 'selection', states: legacy } : { mode: 'unsupported' };
  }
  if (rule === null) return { mode: 'none' };
  if (!isRecord(rule)) return { mode: 'unsupported' };
  const { mode, states, text, question } = rule;
  if (!isStateList(states)) return { mode: 'unsupported' };
  if (mode === 'selection') {
    return typeof question === 'string' && question.trim()
      ? { mode, states, question }
      : { mode, states };
  }
  if (mode === 'disclaimer' && typeof text === 'string' && text.trim()) {
    return { mode, states, text };
  }
  return { mode: 'unsupported' };
}

function isStateList(value: unknown): value is StateCode[] {
  return (
    Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string')
  );
}

/** Where the visit came from. Recorded with every chat of the session; never used for eligibility. */
export type Attribution = {
  [K in keyof Schemas['EmbedAttributionRequest']]?: NonNullable<
    Schemas['EmbedAttributionRequest'][K]
  >;
};

const UTM_PARAMS = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_term: 'utmTerm',
  utm_content: 'utmContent',
} as const;

/** The API drops longer values. */
const MAX_ATTRIBUTION_LENGTH = 200;

/**
 * The UTM values in a query string (such as the host page's `location.search`), for the client's
 * `attribution` option. Other parameters are dropped, and so are values the API would drop: longer
 * than 200 characters, or holding an `@`, which may be an email address.
 */
export function attributionFromQuery(search: string, platform?: Platform): Attribution {
  const params = new URLSearchParams(search);
  const attribution: Attribution = {};
  for (const [param, field] of Object.entries(UTM_PARAMS)) {
    const value = params.get(param)?.trim();
    if (value && value.length <= MAX_ATTRIBUTION_LENGTH && !value.includes('@')) {
      attribution[field] = value;
    }
  }
  if (platform) attribution.platform = platform;
  return attribution;
}
