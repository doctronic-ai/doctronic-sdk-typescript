/**
 * Generated from the Doctronic API contract by `npm run generate`. Do not edit by hand.
 */

export interface paths {
    "/chats/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create a chat
         * @description Create a chat for the user identified by `X-Doctronic-User-ID` within the organization identified by the Bearer token.
         *
         *     The optional `timezone` field accepts an IANA timezone and defaults to `UTC`. The optional `conversationPromptContext` field supplies context for the clinical conversation. Content that fails input validation returns `400 error.partner.validation`.
         *
         *     The response includes the chat's `id` and `createdAt`. Send the next message to `POST /chats/{chatId}/stream/` to begin streaming. Both authentication credentials are required.
         */
        post: operations["partners_api_chats_create_chats__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/chats/{chatId}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a chat
         * @description Fetch a single chat by id.
         *
         *     The chat must have been created through this Doctronic API and belong to both the
         *     authenticated organization and user. A chat that exists but belongs to another organization or
         *     user is masked as `404 error.partner.chat_not_found` so callers cannot probe for the
         *     existence of chats outside their scope.
         *
         *     **Path parameters**
         *     - `chatId`: the chat id returned by `POST /chats/`.
         *
         *     **Auth:** organization Bearer token + `X-Doctronic-User-ID` header (both required), or an embed
         *     session token from `POST /embed/sessions/` alone (it carries its user, so no user-id header).
         */
        get: operations["partners_api_chats_get_chats__chatId___get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/chats/{chatId}/messages/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List chat messages
         * @description List the user and assistant messages in a chat.
         *
         *     Messages are returned oldest first unless `orderBy=-createdAt` is provided. Consultation artifacts are retrieved separately from `GET /artifacts/{artifactId}/`. The chat must belong to the authenticated organization and user scope.
         */
        get: operations["partners_api_chats_messages_chats__chatId__messages__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/chats/{chatId}/stream/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Stream a chat turn (SSE)
         * @description Send a user message to an existing chat and stream the assistant's reply as
         *     Server-Sent Events.
         *
         *     The response is `text/event-stream` (not the standard JSON envelope). Each event is a
         *     frame of the form `event: <type>` followed by a camelCase JSON `data:` payload. The
         *     connection stays open for the whole assistant turn and closes when the turn ends.
         *
         *     **Event types** (see the 200 response examples for full payloads):
         *     - `message.start` / `message.content` / `message.stop`: the assistant message lifecycle
         *       and its streamed text chunks.
         *     - `conversation.offtopic`: the message was classified as off-topic.
         *     - `conversation.end`: the assistant ended the conversation (`reason` explains why).
         *     - `guardian`: a safety condition was detected; `guardianId` is stable.
         *       `title` and `text` (markdown) are the patient-facing copy: show them when present.
         *       `message` is legacy and will be deprecated. Until a guardian has `title` and `text`:
         *       for `safety`, show `message`, which is patient-ready; for `emergency`, show your own
         *       emergency guidance and never `message`, which is empty or an internal label such as
         *       "🛡️ Guardian stopped"; for `feedback`, no UI is needed; for `other`, show your own copy.
         *       `title` and `text` are optional, so keep your own copy as a fallback.
         *       `endsConversation` is true when this guardian ends the conversation: stop input, but keep
         *       reading until the `conversation.end` that follows, which confirms it (if the client disconnects
         *       first, the chat can stay open). After that, sending a message returns
         *       `404 error.partner.chat_not_found`; start a new chat. Decide whether to stop input from
         *       `endsConversation`, never from `category`.
         *       `category` is `emergency`, `safety`, `feedback` or `other`. New categories may be added; treat
         *       unknown values as `other`.
         *       The safety gateways that screen each message report the screener that stopped it: an emergency
         *       screener as its `emergency_*` ID, a prompt injection as `prompt_injection` (`safety`), an
         *       uncommon message as `uncommon_message` (`other`), and any other security check as
         *       `security_gateway` (`safety`).
         *       A `guardianId` is sent at most once per turn unless a later event changes what to show (it
         *       ends the conversation, or brings new copy). Treat a repeated `guardianId` in the same turn as
         *       an update: replace the alert you showed for it rather than adding another. It keeps the
         *       earlier `title` or `text` when it brings none of its own.
         *     - `error`: an error; the stream ends after it. `errorCode` is `error.rate_limited`
         *       (may include `retryAfterSeconds`), `error.internal` (the reply failed; check the transcript
         *       with `GET /chats/{chatId}/messages/` and send a new turn if appropriate), or
         *       `error.consultation_not_ready` (the consultation could not be finalized; booking is
         *       unavailable). Don't resend a turn automatically after an `error` event: it may already have
         *       produced work.
         *     - `skill_code.cta`: an end-of-flow call to action (e.g. see a Doctronic doctor, or book
         *       an in-person visit); carries `skillCode`, `widget`, and an optional `text` label. Embed chats
         *       only get Doctronic visit CTAs when their deployment offers Doctronic visits.
         *     - `ai_consultation.complete`: consultation completion with document IDs. Document retrieval can still return `202` while generation finishes.
         *
         *     **Event compatibility:** Published event names are stable wire identifiers. New event names
         *     may be added. A replacement will be introduced additively and the old name explicitly
         *     deprecated; published names will not be silently renamed. Consumers should ignore event
         *     names they do not recognize.
         *
         *     **Request body**
         *     - `userEvent`: the user message: `type` `user_message`, `userInput`, and optional
         *       `messagePromptContext` (up to 50,000 characters) with situational context for this turn.
         *     - `timezone`: optional IANA timezone (default `UTC`); an invalid value returns `400`.
         *
         *     The chat must have been created through this Doctronic API and belong to both the
         *     authenticated organization and user; otherwise it is masked as
         *     `404 error.partner.chat_not_found`. A chat that has ended (for example after a guardian with
         *     `endsConversation: true`) also returns `404 error.partner.chat_not_found`.
         *
         *     **Auth:** organization Bearer token + `X-Doctronic-User-ID` header (both required), or an embed
         *     session token from `POST /embed/sessions/` alone (it carries its user, so no user-id header).
         *     While the embed deployment is paused, embed requests answer `503 error.embed.paused`, and an open
         *     embed stream ends with an `error` event whose `errorCode` is `error.embed.paused`.
         */
        post: operations["partners_api_chats_stream_chats__chatId__stream__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/embed/config/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get an embed deployment's public config
         * @description Public, non-secret config for the deployment a publishable key selects. The embed iframe page uses `allowedOrigins` for its CSP `frame-ancestors`, and the rest to render the chat.
         *
         *     `paused` is true while Doctronic has paused the deployment. The iframe still loads, but new sessions and every embed-token request answer `503 error.embed.paused`, and open streams end with an `error.embed.paused` event.
         *
         *     `intake.state` says how the chat handles the states it serves, by `mode`: `selection` asks the visitor to pick one of `states` (the server refuses any other with `ineligibleMessage`) and may carry the `question` to ask, `disclaimer` shows `text` with the terms and collects no state, and `null` means no state step. A client that doesn't recognize the mode must not start a session.
         */
        get: operations["partners_api_embed_config_embed_config__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/embed/sessions/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start an anonymous embed session
         * @description Checks eligibility against the deployment's intake rules, creates an anonymous organization-scoped user for this visit, and returns a short-lived embed token scoped to that user's chats.
         *
         *     Does not accept `Idempotency-Key`: a request that sends one gets `400 error.idempotency.unsupported` and creates nothing. The response holds a visitor's token, and with no organization credential the only scope a replay could use is the public deployment, which every visitor shares. A visitor whose request fails starts a new session instead.
         *
         *     Rate limited per client IP and per deployment: over a limit it answers `429 error.embed.rate_limited` with `Retry-After` (and `retryAfter` in seconds) and creates nothing. The iframe should show a "try again in a moment" message and retry after that time.
         */
        post: operations["partners_api_embed_sessions_create_embed_sessions__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/embed/sessions/refresh/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Refresh an embed session token
         * @description Exchanges a valid embed token for a new one for the same session, before it expires. The session's user must still be active.
         */
        post: operations["partners_api_embed_sessions_refresh_embed_sessions_refresh__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/embed/chats/{chatId}/offramps/{kind}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get an off-ramp link for a chat
         * @description A link for one of the deployment's off-ramps. It points at `GET /embed/go/{ref}/`, which records the click and redirects to the destination. The iframe renders the link; nothing is sent to the host page.
         */
        get: operations["partners_api_embed_offramp_link_embed_chats__chatId__offramps__kind___get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/embed/go/{ref}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Follow an off-ramp link
         * @description Records the click and redirects (302) to the off-ramp's destination, with the deployment's correlation parameter when one is configured. Needs no Authorization header: the encrypted ref authorizes it. An expired ref, or one whose user is no longer active, still redirects, without the correlation id and without recording a click. So does a link followed too often (rate limited per client IP and per ref): the visitor still gets to the destination, but the click isn't recorded.
         */
        get: operations["partners_api_embed_offramp_redirect_embed_go__ref___get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/embed/chats/{chatId}/rating/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Rate a chat
         * @description Stores the visitor's answer to the deployment's post-chat rating question (`rating` in `GET /embed/config/`) on the chat's review. Submitting again changes the score. The score must be within the deployment's scale; the review's three-level `review_type` is derived from it for reporting.
         */
        post: operations["partners_api_embed_rating_submit_embed_chats__chatId__rating__post"];
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Add a message to a chat's rating
         * @description Sets the optional free-text follow-up (`messagePrompt` in `GET /embed/config/`) on a chat the visitor has already rated. A null message clears it.
         */
        patch: operations["partners_api_embed_rating_message_embed_chats__chatId__rating__patch"];
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * ArtifactType
         * @description Organization-retrievable consultation artifact kinds.
         * @enum {string}
         */
        ArtifactType: "long_summary" | "short_summary" | "soap_note" | "clinician_note";
        /** ChatResponse */
        ChatResponse: {
            id: string;
            /** Format: date-time */
            createdAt: string;
        };
        /** CreateChatRequest */
        CreateChatRequest: {
            /** @default UTC */
            timezone?: string;
            conversationPromptContext?: string | null;
            /** @description Embed sessions only: the index, in `content.starterPrompts` of `GET /embed/config/`, of the starter prompt the visitor picked to start this chat. Omit it when the visitor typed their own question. */
            starterPromptIndex?: number | null;
        };
        /** CreateEmbedSessionRequest */
        CreateEmbedSessionRequest: {
            key: string;
            termsAccepted: boolean;
            intake: components["schemas"]["EmbedIntakeRequest"];
            /** @description Where the visit came from, as the host page passed it to the iframe: its UTM values and platform. Recorded with every chat of the session; values that don't fit are dropped, never refused. */
            attribution?: components["schemas"]["EmbedAttributionRequest"] | null;
        };
        /** EmbedAttributionRequest */
        EmbedAttributionRequest: {
            /** @description The host page's UTM value of the same name, copied onto the iframe URL. Up to 200 characters; a longer or non-printable value, or one containing `@`, is dropped. */
            utmSource?: string | null;
            /** @description The host page's UTM value of the same name, copied onto the iframe URL. Up to 200 characters; a longer or non-printable value, or one containing `@`, is dropped. */
            utmMedium?: string | null;
            /** @description The host page's UTM value of the same name, copied onto the iframe URL. Up to 200 characters; a longer or non-printable value, or one containing `@`, is dropped. */
            utmCampaign?: string | null;
            /** @description The host page's UTM value of the same name, copied onto the iframe URL. Up to 200 characters; a longer or non-printable value, or one containing `@`, is dropped. */
            utmTerm?: string | null;
            /** @description The host page's UTM value of the same name, copied onto the iframe URL. Up to 200 characters; a longer or non-printable value, or one containing `@`, is dropped. */
            utmContent?: string | null;
            /** @description Where the host page runs: `web`, or the organization's `ios` or `android` app. Any other value is dropped. */
            platform?: components["schemas"]["EmbedPlatform"] | null;
        };
        /** EmbedConfigResponse */
        EmbedConfigResponse: {
            deploymentId: string;
            partnerId: string;
            configVersion: string;
            allowedOrigins: string[];
            theme: components["schemas"]["EmbedTheme"];
            content: components["schemas"]["EmbedCopy"];
            intake: components["schemas"]["EmbedIntake"];
            offramps: components["schemas"]["EmbedOfframpConfig"][];
            rating: components["schemas"]["EmbedRatingConfig"] | null;
            hiddenArtifacts: components["schemas"]["ArtifactType"][];
            hideSoapNote: boolean;
            paused: boolean;
        };
        /** EmbedCopy */
        EmbedCopy: {
            title: string;
            body: string;
            /** @default Ask anything about your health */
            inputPlaceholder?: string;
            fallbackContact?: string | null;
            subtitle?: string | null;
            introMessage?: string | null;
            /** @default [] */
            starterPrompts?: components["schemas"]["EmbedStarterPrompt"][];
        };
        /** EmbedIntake */
        EmbedIntake: {
            /** @default 18 */
            minAge?: number;
            state?: (components["schemas"]["StateSelection"] | components["schemas"]["StateDisclaimer"]) | null;
            roles?: string[] | null;
            /** @default Sorry, this service isn't available to you yet. */
            ineligibleMessage?: string;
        };
        /** EmbedIntakeRequest */
        EmbedIntakeRequest: {
            age: number;
            sex: components["schemas"]["Sex"];
            state?: string | null;
            role?: string | null;
        };
        /** EmbedOfframpConfig */
        EmbedOfframpConfig: {
            kind: string;
            label: string;
            showWhen: components["schemas"]["EmbedOfframpTrigger"];
        };
        /**
         * EmbedOfframpTrigger
         * @description When a client shows an off-ramp. Any condition that matches shows it; once shown it stays.
         *
         *     Evaluated by the embed iframe from stream events; the server only serves the rule.
         */
        EmbedOfframpTrigger: {
            /** @default [] */
            ctaWidgets?: string[];
            /** @default false */
            onConversationEnd?: boolean;
            afterAssistantReplies?: number | null;
        };
        /**
         * EmbedPlatform
         * @description Where the host page runs, as only the host page can tell: a native app's web view looks like a mobile
         *     browser.
         * @enum {string}
         */
        EmbedPlatform: "web" | "ios" | "android";
        /** EmbedRateLimitedData */
        EmbedRateLimitedData: {
            /** @example 60 */
            retryAfter: number;
        };
        /** EmbedRatingConfig */
        EmbedRatingConfig: {
            scale: string;
            min: number;
            max: number;
            question: string;
            minLabel: string;
            maxLabel: string;
            messagePrompt: string;
        };
        /** EmbedSessionResponse */
        EmbedSessionResponse: {
            /** @description The embed session token. Opaque: send it as a Bearer token, don't parse it. */
            token: string;
            /** @description When the token expires, in Unix seconds on the server's clock. */
            expiresAt: number;
            /** @description When to refresh the token, in Unix seconds on the server's clock. */
            refreshAfter: number;
            /** @description Seconds from this response until the token expires. Unlike `expiresAt`, it doesn't depend on the client's clock. A replayed response (same `Idempotency-Key`) repeats the original value. */
            expiresInSeconds: number;
            /** @description Seconds from this response until the client should refresh the token. Unlike `refreshAfter`, it doesn't depend on the client's clock. A replayed response (same `Idempotency-Key`) repeats the original value. */
            refreshInSeconds: number;
            configVersion: string;
        };
        /**
         * EmbedStarterPrompt
         * @description A suggested first question on the landing. Picking it sends `message` as the visitor's first message.
         */
        EmbedStarterPrompt: {
            label: string;
            message: string;
        };
        /** EmbedTheme */
        EmbedTheme: {
            primaryColor: string;
            secondaryColor: string;
            headlineFont: string;
            bodyFont: string;
            fontStylesheetUrl?: string | null;
        };
        /**
         * ErrorResponse
         * @description Standard error response model
         */
        ErrorResponse: {
            /** @default error.unknown */
            code?: string;
            /** @default Request failed */
            message?: string;
            data?: unknown;
        };
        /** ErrorResponseWithEmbedRateLimitedData */
        ErrorResponseWithEmbedRateLimitedData: {
            /** @default error */
            code?: string;
            /** @default  */
            message?: string;
            data?: components["schemas"]["EmbedRateLimitedData"] | null;
        };
        /** ErrorResponseWithInsufficientScopeData */
        ErrorResponseWithInsufficientScopeData: {
            /** @default error */
            code?: string;
            /** @default  */
            message?: string;
            data?: components["schemas"]["InsufficientScopeData"] | null;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            detail?: components["schemas"]["ValidationError"][];
        };
        /** InsufficientScopeData */
        InsufficientScopeData: {
            requiredScope: components["schemas"]["Scope"];
        };
        /** MessageResponse */
        MessageResponse: {
            /** @enum {string} */
            role: "user" | "assistant";
            content: string;
            messageId: string;
            createdAt?: string | null;
        };
        /** OfframpLinkResponse */
        OfframpLinkResponse: {
            kind: string;
            label: string;
            url: string;
        };
        /** Page[MessageResponse] */
        Page_MessageResponse_: {
            items: components["schemas"]["MessageResponse"][];
            total: number;
            page: number;
            size: number;
            pages: number;
            hasNext: boolean;
            hasPrev: boolean;
        };
        /** RatingResponse */
        RatingResponse: {
            score: number;
            scale: string;
        };
        /**
         * Scope
         * @enum {string}
         */
        Scope: "patients:read" | "patients:create" | "patients:update" | "addresses:read" | "addresses:update" | "pharmacies:search" | "pharmacies:set_preferred" | "coverage:update" | "chats:read" | "chats:create" | "chats:send_message" | "appointments:read" | "appointments:book" | "appointments:cancel" | "appointments:reschedule" | "artifacts:read";
        /**
         * Sex
         * @enum {string}
         */
        Sex: "male" | "female";
        /**
         * State
         * @enum {string}
         */
        State: "AK" | "AL" | "AR" | "AZ" | "CA" | "CO" | "CT" | "DC" | "DE" | "FL" | "GA" | "HI" | "IA" | "ID" | "IL" | "IN" | "KS" | "KY" | "LA" | "MA" | "MD" | "ME" | "MI" | "MN" | "MO" | "MS" | "MT" | "NC" | "ND" | "NE" | "NH" | "NJ" | "NM" | "NV" | "NY" | "OH" | "OK" | "OR" | "PA" | "RI" | "SC" | "SD" | "TN" | "TX" | "UT" | "VA" | "VT" | "WA" | "WI" | "WV" | "WY";
        /**
         * StateDisclaimer
         * @description The terms step shows `text`, which names the states served. No state is collected or enforced.
         */
        StateDisclaimer: {
            states: components["schemas"]["State"][];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            mode: "disclaimer";
            text: string;
        };
        /**
         * StateSelection
         * @description The visitor picks a state from `states`; the server rejects any other.
         */
        StateSelection: {
            states: components["schemas"]["State"][];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            mode: "selection";
            ineligibleMessage: string;
            question?: string | null;
        };
        /** StreamChatRequest */
        StreamChatRequest: {
            userEvent: components["schemas"]["UserMessageEvent"];
            /** @default UTC */
            timezone?: string;
        };
        /** SubmitRatingRequest */
        SubmitRatingRequest: {
            score: number;
        };
        /** SuccessResponseForChatResponse */
        SuccessResponseForChatResponse: {
            /**
             * @description Success code
             * @default success
             */
            code?: string;
            /**
             * @description Success message
             * @default Request successful
             */
            message?: string;
            /** @description Response data */
            data: components["schemas"]["ChatResponse"];
        };
        /** SuccessResponseForEmbedConfigResponse */
        SuccessResponseForEmbedConfigResponse: {
            /**
             * @description Success code
             * @default success
             */
            code?: string;
            /**
             * @description Success message
             * @default Request successful
             */
            message?: string;
            /** @description Response data */
            data: components["schemas"]["EmbedConfigResponse"];
        };
        /** SuccessResponseForEmbedSessionResponse */
        SuccessResponseForEmbedSessionResponse: {
            /**
             * @description Success code
             * @default success
             */
            code?: string;
            /**
             * @description Success message
             * @default Request successful
             */
            message?: string;
            /** @description Response data */
            data: components["schemas"]["EmbedSessionResponse"];
        };
        /** SuccessResponseForOfframpLinkResponse */
        SuccessResponseForOfframpLinkResponse: {
            /**
             * @description Success code
             * @default success
             */
            code?: string;
            /**
             * @description Success message
             * @default Request successful
             */
            message?: string;
            /** @description Response data */
            data: components["schemas"]["OfframpLinkResponse"];
        };
        /** SuccessResponseForPage[MessageResponse] */
        SuccessResponseForPage_MessageResponse_: {
            /**
             * @description Success code
             * @default success
             */
            code?: string;
            /**
             * @description Success message
             * @default Request successful
             */
            message?: string;
            /** @description Response data */
            data: components["schemas"]["Page_MessageResponse_"];
        };
        /** SuccessResponseForRatingResponse */
        SuccessResponseForRatingResponse: {
            /**
             * @description Success code
             * @default success
             */
            code?: string;
            /**
             * @description Success message
             * @default Request successful
             */
            message?: string;
            /** @description Response data */
            data: components["schemas"]["RatingResponse"];
        };
        /** UpdateRatingMessageRequest */
        UpdateRatingMessageRequest: {
            message: string | null;
        };
        /** ValidationError */
        ValidationError: {
            loc: (string | number)[];
            msg: string;
            type: string;
            input?: unknown;
            ctx?: Record<string, never>;
        };
        /** ValidationErrorDetail */
        ValidationErrorDetail: {
            /**
             * @description Request location and camel-case field path, separated by dots.
             * @example body.requiredField
             */
            field: string;
            /**
             * @description Human-readable explanation of the validation failure.
             * @example Field required
             */
            message: string;
            /**
             * @description Machine-readable validation failure code.
             * @example error.validation.missing
             */
            code: string;
        };
        /**
         * ValidationErrorResponse
         * @example {
         *       "code": "error.validation_error",
         *       "message": "Validation error",
         *       "data": [
         *         {
         *           "field": "body.requiredField",
         *           "message": "Field required",
         *           "code": "error.validation.missing"
         *         }
         *       ]
         *     }
         */
        ValidationErrorResponse: {
            /**
             * @description Stable validation error code.
             * @default error.validation_error
             * @constant
             */
            code: "error.validation_error";
            /**
             * @description Human-readable error summary.
             * @default Validation error
             * @constant
             */
            message: "Validation error";
            /** @description One entry for each request validation failure. */
            data: components["schemas"]["ValidationErrorDetail"][];
        };
        /**
         * ConsultationArtifacts
         * @description IDs of the consultation's documents, for `GET /artifacts/{artifactId}/`; `null` when one isn't available.
         */
        ConsultationArtifacts: {
            /** @default null */
            longSummary: string | null;
            /** @default null */
            shortSummary: string | null;
            /** @default null */
            soapNote: string | null;
        };
        /** @enum {string} */
        GuardianCategory: "emergency" | "safety" | "feedback" | "other";
        /**
         * PartnerGuardianId
         * @enum {string}
         */
        PartnerGuardianId: "emergency_acute_aortic_dissection_or_ruptured_aortic_aneurysm" | "emergency_acute_coronary_syndrome" | "emergency_breathing" | "emergency_cerebrovascular_accident_or_stroke" | "emergency_constant_bleeding" | "emergency_crushing_chest_pain" | "emergency_domestic_abuse" | "emergency_exact_words" | "emergency_harm_others" | "emergency_major_trauma" | "emergency_psychotic_event" | "emergency_seizure" | "emergency_self_harm" | "emergency_severe_abdominal_pain" | "emergency_shortness_of_breath" | "emergency_stroke" | "emergency_venomous_bite" | "emergency_worst_headache" | "agent_feedback_negative" | "agent_feedback_positive" | "check_emergency_phrase" | "check_input_language" | "custom_guardians_gateway" | "security_gateway" | "extraction_decomposition_detector" | "harmful_content_detector" | "identity_instruction_attack_detector" | "policy_violation" | "prompt_injection" | "uncommon_message" | "unified_emergency_detector";
        /**
         * StreamChatCTAEvent
         * @description An end-of-flow call to action. Use `text` as its label when present.
         */
        StreamChatCTAEvent: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "skill_code.cta";
            skillCode: string;
            /** @default null */
            widget?: string | null;
            /** @default null */
            text?: string | null;
        };
        /**
         * StreamChatConsultationCompleteEvent
         * @description The consultation is complete. `artifacts` holds the IDs of its documents.
         */
        StreamChatConsultationCompleteEvent: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "ai_consultation.complete";
            artifacts: components["schemas"]["ConsultationArtifacts"];
        };
        /**
         * StreamChatConversationEndEvent
         * @description The assistant ended the conversation; `reason` explains why when present.
         */
        StreamChatConversationEndEvent: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "conversation.end";
            /** @default null */
            messageId?: string | null;
            /** @default null */
            reason?: string | null;
        };
        /**
         * StreamChatConversationOfftopicEvent
         * @description The user's message was classified as off-topic.
         */
        StreamChatConversationOfftopicEvent: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "conversation.offtopic";
            /** @default null */
            messageId?: string | null;
        };
        /**
         * StreamChatErrorEvent
         * @description An error; the stream ends after it. Don't resend the turn automatically: it may already have produced work.
         */
        StreamChatErrorEvent: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "error";
            errorCode: string;
            message: string;
            /** @default null */
            retryAfterSeconds?: number | null;
        };
        /**
         * StreamChatGuardianEvent
         * @description A safety condition was detected. Show `title` and `text` when present. When `endsConversation` is true, stop
         *     input but keep reading until `conversation.end`. Treat a repeated `guardianId` in the same turn as an update.
         */
        StreamChatGuardianEvent: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "guardian";
            guardianId: components["schemas"]["PartnerGuardianId"] | string;
            /** @default  */
            message: string;
            /** @default null */
            title?: string | null;
            /** @default null */
            text?: string | null;
            /** @default false */
            endsConversation: boolean;
            /** @default other */
            category: components["schemas"]["GuardianCategory"] | string;
        };
        /**
         * StreamChatMessageContentEvent
         * @description A chunk of the message's text: append it to the message with the same `messageId`.
         */
        StreamChatMessageContentEvent: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "message.content";
            messageId: string;
            content: string;
        };
        /**
         * StreamChatMessageStartEvent
         * @description A message started. Its text follows in `message.content` events with the same `messageId`.
         */
        StreamChatMessageStartEvent: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "message.start";
            /**
             * @default assistant
             * @enum {string}
             */
            role: "assistant" | "user";
            messageId: string;
            /**
             * @description When the message started, in epoch milliseconds.
             * @default null
             */
            messageTimestamp?: number | null;
        };
        /**
         * StreamChatMessageStopEvent
         * @description The message with this `messageId` is complete. The turn can go on with more messages.
         */
        StreamChatMessageStopEvent: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "message.stop";
            messageId: string;
        };
        /**
         * StreamChatEvent
         * @description The JSON `data` of one event of `POST /chats/{chatId}/stream/`, keyed on `type`, which matches the SSE `event:` name. New event types may be added: ignore types you don't recognize.
         */
        StreamChatEvent: components["schemas"]["StreamChatMessageStartEvent"] | components["schemas"]["StreamChatMessageContentEvent"] | components["schemas"]["StreamChatMessageStopEvent"] | components["schemas"]["StreamChatConversationEndEvent"] | components["schemas"]["StreamChatConversationOfftopicEvent"] | components["schemas"]["StreamChatGuardianEvent"] | components["schemas"]["StreamChatErrorEvent"] | components["schemas"]["StreamChatCTAEvent"] | components["schemas"]["StreamChatConsultationCompleteEvent"];
        /** UserMessageEvent */
        UserMessageEvent: {
            /**
             * @default user_message
             * @constant
             */
            type?: "user_message";
            userInput: string;
            messagePromptContext?: string | null;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    partners_api_chats_create_chats__post: {
        parameters: {
            query?: never;
            header?: {
                /** @description Unique key for safely retrying this mutation for 24 hours. Reuse the same key only with the same request payload. */
                "Idempotency-Key"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateChatRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    /** @description `true` when this response was replayed from an earlier successful request. */
                    "Idempotency-Replayed"?: "true";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SuccessResponseForChatResponse"];
                };
            };
            /** @description The X-Doctronic-User-ID header is required for this endpoint. / Validation error. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unauthorized. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.auth.unauthorized",
                     *       "message": "Unauthorized."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description This API key does not have the scope this endpoint requires. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.auth.insufficient_scope",
                     *       "message": "This API key does not have the scope this endpoint requires.",
                     *       "data": {
                     *         "requiredScope": "chats:create"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
                };
            };
            /** @description User not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.member.not_found",
                     *       "message": "User not found."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Idempotency conflict: the key is currently being processed, or it was already used with a different payload. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Legacy FastAPI schema artifact retained for code-generation compatibility. The server returns HTTP 400, not 422, when request validation fails. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Too many requests right now. Please wait a moment and try again. Sent for embed session tokens only. */
            429: {
                headers: {
                    /** @description Seconds to wait before retrying. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.rate_limited",
                     *       "message": "Too many requests right now. Please wait a moment and try again.",
                     *       "data": {
                     *         "retryAfter": 60
                     *       }
                     *     }
                     */
                    "application/json": unknown;
                };
            };
            /** @description Idempotent request coordination is temporarily unavailable before processing begins. */
            503: {
                headers: {
                    /** @description Minimum wait in seconds before retrying with the same Idempotency-Key and request body. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.idempotency.unavailable",
                     *       "message": "Idempotent request processing is temporarily unavailable. Please retry with the same key."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    partners_api_chats_get_chats__chatId___get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                chatId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SuccessResponseForChatResponse"];
                };
            };
            /** @description The X-Doctronic-User-ID header is required for this endpoint. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.member.header_required",
                     *       "message": "The X-Doctronic-User-ID header is required for this endpoint."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unauthorized. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.auth.unauthorized",
                     *       "message": "Unauthorized."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description This API key does not have the scope this endpoint requires. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.auth.insufficient_scope",
                     *       "message": "This API key does not have the scope this endpoint requires.",
                     *       "data": {
                     *         "requiredScope": "chats:read"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
                };
            };
            /** @description User not found. / Chat not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Legacy FastAPI schema artifact retained for code-generation compatibility. The server returns HTTP 400, not 422, when request validation fails. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Too many requests right now. Please wait a moment and try again. Sent for embed session tokens only. */
            429: {
                headers: {
                    /** @description Seconds to wait before retrying. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.rate_limited",
                     *       "message": "Too many requests right now. Please wait a moment and try again.",
                     *       "data": {
                     *         "retryAfter": 60
                     *       }
                     *     }
                     */
                    "application/json": unknown;
                };
            };
        };
    };
    partners_api_chats_messages_chats__chatId__messages__get: {
        parameters: {
            query?: {
                /** @description Page number */
                page?: number;
                /** @description Items per page */
                size?: number;
                /** @description Order by field with - prefix. Allowed: createdAt */
                orderBy?: string | null;
            };
            header?: never;
            path: {
                chatId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SuccessResponseForPage_MessageResponse_"];
                };
            };
            /** @description The X-Doctronic-User-ID header is required for this endpoint. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.member.header_required",
                     *       "message": "The X-Doctronic-User-ID header is required for this endpoint."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unauthorized. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.auth.unauthorized",
                     *       "message": "Unauthorized."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description This API key does not have the scope this endpoint requires. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.auth.insufficient_scope",
                     *       "message": "This API key does not have the scope this endpoint requires.",
                     *       "data": {
                     *         "requiredScope": "chats:read"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
                };
            };
            /** @description User not found. / Chat not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Legacy FastAPI schema artifact retained for code-generation compatibility. The server returns HTTP 400, not 422, when request validation fails. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Too many requests right now. Please wait a moment and try again. Sent for embed session tokens only. */
            429: {
                headers: {
                    /** @description Seconds to wait before retrying. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.rate_limited",
                     *       "message": "Too many requests right now. Please wait a moment and try again.",
                     *       "data": {
                     *         "retryAfter": 60
                     *       }
                     *     }
                     */
                    "application/json": unknown;
                };
            };
        };
    };
    partners_api_chats_stream_chats__chatId__stream__post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                chatId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StreamChatRequest"];
            };
        };
        responses: {
            /** @description SSE stream of chat events. The type field identifies the event. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": string;
                };
            };
            /** @description The X-Doctronic-User-ID header is required for this endpoint. / Validation error. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unauthorized. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.auth.unauthorized",
                     *       "message": "Unauthorized."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description This API key does not have the scope this endpoint requires. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.auth.insufficient_scope",
                     *       "message": "This API key does not have the scope this endpoint requires.",
                     *       "data": {
                     *         "requiredScope": "chats:send_message"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
                };
            };
            /** @description User not found. / Chat not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description A stream is already in progress for this chat. Wait for it to finish before retrying. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.partner.chat_stream_in_progress",
                     *       "message": "A stream is already in progress for this chat. Wait for it to finish before retrying."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Legacy FastAPI schema artifact retained for code-generation compatibility. The server returns HTTP 400, not 422, when request validation fails. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Too many requests right now. Please wait a moment and try again. Sent for embed session tokens only. */
            429: {
                headers: {
                    /** @description Seconds to wait before retrying. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.rate_limited",
                     *       "message": "Too many requests right now. Please wait a moment and try again.",
                     *       "data": {
                     *         "retryAfter": 60
                     *       }
                     *     }
                     */
                    "application/json": unknown;
                };
            };
            /** @description Chat streaming is temporarily unavailable. Please retry shortly. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.partner.chat_stream_unavailable",
                     *       "message": "Chat streaming is temporarily unavailable. Please retry shortly."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    partners_api_embed_config_embed_config__get: {
        parameters: {
            query: {
                key: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SuccessResponseForEmbedConfigResponse"];
                };
            };
            /** @description The request failed validation and the server returned HTTP 400. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.validation_error",
                     *       "message": "Validation error",
                     *       "data": [
                     *         {
                     *           "field": "body.requiredField",
                     *           "message": "Field required",
                     *           "code": "error.validation.missing"
                     *         }
                     *       ]
                     *     }
                     */
                    "application/json": components["schemas"]["ValidationErrorResponse"];
                };
            };
            /** @description Unknown publishable key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.key_invalid",
                     *       "message": "Unknown publishable key."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Legacy FastAPI schema artifact retained for code-generation compatibility. The server returns HTTP 400, not 422, when request validation fails. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    partners_api_embed_sessions_create_embed_sessions__post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateEmbedSessionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SuccessResponseForEmbedSessionResponse"];
                };
            };
            /** @description This endpoint does not accept an Idempotency-Key. Send the request without it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.idempotency.unsupported",
                     *       "message": "This endpoint does not accept an Idempotency-Key. Send the request without it."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unknown publishable key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.key_invalid",
                     *       "message": "Unknown publishable key."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description This service isn't available to you. / The terms of service must be accepted first. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Legacy FastAPI schema artifact retained for code-generation compatibility. The server returns HTTP 400, not 422, when request validation fails. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Too many requests right now. Please wait a moment and try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.rate_limited",
                     *       "message": "Too many requests right now. Please wait a moment and try again.",
                     *       "data": {
                     *         "retryAfter": 60
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithEmbedRateLimitedData"];
                };
            };
            /** @description Embed sessions are not configured. / This chat is paused right now. Please try again later. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    partners_api_embed_sessions_refresh_embed_sessions_refresh__post: {
        parameters: {
            query?: never;
            header?: {
                /** @description Unique key for safely retrying this mutation for 24 hours. Reuse the same key only with the same request payload. */
                "Idempotency-Key"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    /** @description `true` when this response was replayed from an earlier successful request. */
                    "Idempotency-Replayed"?: "true";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SuccessResponseForEmbedSessionResponse"];
                };
            };
            /** @description The embed session is missing, invalid or expired. / Unauthorized. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description User not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.member.not_found",
                     *       "message": "User not found."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Idempotency conflict: the key is currently being processed, or it was already used with a different payload. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Too many requests right now. Please wait a moment and try again. Sent for embed session tokens only. */
            429: {
                headers: {
                    /** @description Seconds to wait before retrying. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.rate_limited",
                     *       "message": "Too many requests right now. Please wait a moment and try again.",
                     *       "data": {
                     *         "retryAfter": 60
                     *       }
                     *     }
                     */
                    "application/json": unknown;
                };
            };
            /** @description Embed sessions are not configured. */
            503: {
                headers: {
                    /** @description Minimum wait in seconds before retrying with the same Idempotency-Key and request body. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.not_configured",
                     *       "message": "Embed sessions are not configured."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    partners_api_embed_offramp_link_embed_chats__chatId__offramps__kind___get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                chatId: string;
                kind: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SuccessResponseForOfframpLinkResponse"];
                };
            };
            /** @description The request failed validation and the server returned HTTP 400. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.validation_error",
                     *       "message": "Validation error",
                     *       "data": [
                     *         {
                     *           "field": "body.requiredField",
                     *           "message": "Field required",
                     *           "code": "error.validation.missing"
                     *         }
                     *       ]
                     *     }
                     */
                    "application/json": components["schemas"]["ValidationErrorResponse"];
                };
            };
            /** @description The embed session is missing, invalid or expired. / Unauthorized. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description User not found. / This off-ramp isn't configured. / Chat not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Legacy FastAPI schema artifact retained for code-generation compatibility. The server returns HTTP 400, not 422, when request validation fails. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Too many requests right now. Please wait a moment and try again. Sent for embed session tokens only. */
            429: {
                headers: {
                    /** @description Seconds to wait before retrying. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.rate_limited",
                     *       "message": "Too many requests right now. Please wait a moment and try again.",
                     *       "data": {
                     *         "retryAfter": 60
                     *       }
                     *     }
                     */
                    "application/json": unknown;
                };
            };
            /** @description Embed sessions are not configured. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.not_configured",
                     *       "message": "Embed sessions are not configured."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    partners_api_embed_offramp_redirect_embed_go__ref___get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ref: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            302: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request failed validation and the server returned HTTP 400. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.validation_error",
                     *       "message": "Validation error",
                     *       "data": [
                     *         {
                     *           "field": "body.requiredField",
                     *           "message": "Field required",
                     *           "code": "error.validation.missing"
                     *         }
                     *       ]
                     *     }
                     */
                    "application/json": components["schemas"]["ValidationErrorResponse"];
                };
            };
            /** @description This off-ramp isn't configured. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.offramp_not_found",
                     *       "message": "This off-ramp isn't configured."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Legacy FastAPI schema artifact retained for code-generation compatibility. The server returns HTTP 400, not 422, when request validation fails. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    partners_api_embed_rating_submit_embed_chats__chatId__rating__post: {
        parameters: {
            query?: never;
            header?: {
                /** @description Unique key for safely retrying this mutation for 24 hours. Reuse the same key only with the same request payload. */
                "Idempotency-Key"?: string;
            };
            path: {
                chatId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SubmitRatingRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    /** @description `true` when this response was replayed from an earlier successful request. */
                    "Idempotency-Replayed"?: "true";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SuccessResponseForRatingResponse"];
                };
            };
            /** @description Validation error. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.partner.validation",
                     *       "message": "Validation error."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description The embed session is missing, invalid or expired. / Unauthorized. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description User not found. / Chat not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description This deployment doesn't ask for a rating. Idempotency conflict: the key is currently being processed, or it was already used with a different payload. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.rating_not_configured",
                     *       "message": "This deployment doesn't ask for a rating."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Legacy FastAPI schema artifact retained for code-generation compatibility. The server returns HTTP 400, not 422, when request validation fails. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Too many requests right now. Please wait a moment and try again. Sent for embed session tokens only. */
            429: {
                headers: {
                    /** @description Seconds to wait before retrying. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.rate_limited",
                     *       "message": "Too many requests right now. Please wait a moment and try again.",
                     *       "data": {
                     *         "retryAfter": 60
                     *       }
                     *     }
                     */
                    "application/json": unknown;
                };
            };
            /** @description Idempotent request coordination is temporarily unavailable before processing begins. */
            503: {
                headers: {
                    /** @description Minimum wait in seconds before retrying with the same Idempotency-Key and request body. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    partners_api_embed_rating_message_embed_chats__chatId__rating__patch: {
        parameters: {
            query?: never;
            header?: {
                /** @description Unique key for safely retrying this mutation for 24 hours. Reuse the same key only with the same request payload. */
                "Idempotency-Key"?: string;
            };
            path: {
                chatId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateRatingMessageRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    /** @description `true` when this response was replayed from an earlier successful request. */
                    "Idempotency-Replayed"?: "true";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SuccessResponseForRatingResponse"];
                };
            };
            /** @description The request failed validation and the server returned HTTP 400. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.validation_error",
                     *       "message": "Validation error",
                     *       "data": [
                     *         {
                     *           "field": "body.requiredField",
                     *           "message": "Field required",
                     *           "code": "error.validation.missing"
                     *         }
                     *       ]
                     *     }
                     */
                    "application/json": components["schemas"]["ValidationErrorResponse"];
                };
            };
            /** @description The embed session is missing, invalid or expired. / Unauthorized. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description User not found. / Chat not found. / Rate the chat before adding a message. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description This deployment doesn't ask for a rating. Idempotency conflict: the key is currently being processed, or it was already used with a different payload. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.rating_not_configured",
                     *       "message": "This deployment doesn't ask for a rating."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Legacy FastAPI schema artifact retained for code-generation compatibility. The server returns HTTP 400, not 422, when request validation fails. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Too many requests right now. Please wait a moment and try again. Sent for embed session tokens only. */
            429: {
                headers: {
                    /** @description Seconds to wait before retrying. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.embed.rate_limited",
                     *       "message": "Too many requests right now. Please wait a moment and try again.",
                     *       "data": {
                     *         "retryAfter": 60
                     *       }
                     *     }
                     */
                    "application/json": unknown;
                };
            };
            /** @description Idempotent request coordination is temporarily unavailable before processing begins. */
            503: {
                headers: {
                    /** @description Minimum wait in seconds before retrying with the same Idempotency-Key and request body. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
