/**
 * Generated from the Doctronic API contract by `npm run generate`. Do not edit by hand.
 */

export interface paths {
    "/users/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get user details
         * @description Retrieve the user account for the authenticated organization.
         *
         *     The user is identified via the `X-Doctronic-User-ID` header; no path parameter is used.
         *     Returns the same shape as the Create User response.
         */
        get: operations["partners_api_users_details_users__get"];
        put?: never;
        /**
         * Create a user
         * @description Create a user inside the organization identified by the Bearer token.
         *
         *     All fields are optional at creation time. `firstName`, `lastName`, `dateOfBirth`, and `phoneNumber` are required before appointment booking. When provided, `dateOfBirth` must represent an age from 18 through 120. The response lists any fields still needed for booking in `missingAppointmentFields`; add them later with `PATCH /users/`. This operation requires an organization Bearer token.
         */
        post: operations["partners_api_users_create_users__post"];
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update organization-scoped user details
         * @description Update the active user identified by `X-Doctronic-User-ID` within the authenticated organization's realm.
         *     Only supplied fields change; omitted fields are preserved and explicit null clears a field.
         *     Empty/blank names or phone numbers are rejected. Email/phone conflicts never merge or transfer accounts.
         *     Organization servers must authenticate their member and derive this user ID server-side.
         *
         *     The user ID and existing chats remain unchanged. Corrections apply to the profile and future bookings,
         *     not previously booked visits or historical clinical content. Return to the same completed chat to book
         *     after correcting missing demographics; address, chat readiness and availability are still checked.
         *     This does not verify ownership of a phone/email or change the supported-phone policy.
         *
         *     Retry temporary 503s after `Retry-After`, keeping the same Idempotency-Key, user ID and request body.
         *     Replayed responses reflect the original update; GET /users/ returns the current profile.
         */
        patch: operations["partners_api_users_update_users__patch"];
        trace?: never;
    };
    "/chats/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List chats
         * @description List chats available to the authenticated organization and user scope.
         *
         *     Use `page`, `size`, and `orderBy` to paginate and sort the results. The response includes the current page of `items`, the unpaginated `total`, the computed page count, and next-page and previous-page indicators. Both authentication credentials are required.
         */
        get: operations["partners_api_chats_list_chats__get"];
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
    "/appointments/scheduled/available-slots/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List available scheduled appointment slots
         * @description Returns available appointment start times filtered to practitioners credentialed in the provided US state.
         */
        get: operations["partners_api_appointments_available_slots_appointments_scheduled_available_slots__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/appointments/scheduled/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Book a scheduled appointment
         * @description Creates a scheduled appointment for a specific future time slot.
         *     The slot must be one returned by GET /appointments/scheduled/available-slots/
         *     for the provided location.state.
         */
        post: operations["partners_api_appointments_create_scheduled_appointments_scheduled__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/appointments/asap/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Book an ASAP appointment
         * @description Places the patient in a shared waiting room immediately.
         *     A practitioner credentialed in the given state will join when available: there is no guaranteed wait time.
         */
        post: operations["partners_api_appointments_create_asap_appointments_asap__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/appointments/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List appointments
         * @description List appointments for the user identified by `X-Doctronic-User-ID` within the authenticated organization.
         *
         *     Use `status` to filter by appointment status, and `page` and `size` to paginate the results. Both authentication credentials are required.
         */
        get: operations["partners_api_appointments_list_appointments__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/appointments/{appointment_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get appointment details
         * @description Fetch a single appointment by id
         */
        get: operations["partners_api_appointment_details_appointments__appointment_id___get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/appointments/{appointment_id}/result/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get appointment result
         * @description Retrieve the post-visit result for an appointment.
         *
         *     The result lists each prescription's display name and pharmacy destination, plus a stable artifact identifier for the clinician-finalized note once it is available. The clinician note is separate from the pre-visit AI SOAP-note artifact. Retrieve it with `GET /artifacts/{artifactId}/`; the `artifact.ready` event signals when its content is ready. The result reflects the clinical data recorded when the clinician finalized the note.
         *
         *     A `200` response means the appointment is fulfilled and its result is available. A `202` response means the result is not available yet and the client should retry later with bounded backoff. A `404` response means the appointment is unavailable in the authenticated organization and user scope. A `409` response means the appointment was cancelled or was a no-show, so no result will become available. Both authentication credentials are required.
         */
        get: operations["partners_api_appointment_result_appointments__appointment_id__result__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/appointments/{appointment_id}/cancel/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel appointment
         * @description Cancel a booked appointment
         */
        post: operations["partners_api_appointments_cancel_appointments__appointment_id__cancel__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/appointments/{appointment_id}/reschedule/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reschedule appointment
         * @description Reschedule a booked appointment to a new time slot
         */
        post: operations["partners_api_appointments_reschedule_appointments__appointment_id__reschedule__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/address/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a user's address
         * @description Retrieve the address currently on file for the authenticated user.
         *
         *     The user is identified via the `X-Doctronic-User-ID` header; no path parameter is used.
         *     Returns a 404 if no address is on file for the user.
         */
        get: operations["partners_api_address_get_address__get"];
        /**
         * Set a user's address
         * @description Create or replace the address on file for the authenticated user (upsert).
         *
         *     All fields are optional individually, but a full address (`line1`, `city`, `state`, `postalCode`)
         *     is required before the user can book an appointment; that is enforced at booking time.
         */
        put: operations["partners_api_address_set_address__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pharmacy/search/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Search pharmacies
         * @description Search pharmacies near a location, optionally by name.
         *
         *     `latitude` and `longitude` are required. Provide `searchTerm` to match pharmacy names; without it, results are ranked by proximity. Provide `state` to limit the results to one US state. Use the returned `ncpdpId` when saving a user's preferred pharmacy. This operation requires an organization Bearer token.
         */
        post: operations["partners_api_pharmacy_search_pharmacy_search__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pharmacy/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Set a user's pharmacy
         * @description Save or replace the authenticated user's preferred pharmacy.
         *
         *     Provide the `ncpdpId` returned by `POST /pharmacy/search/`. The user must already have `firstName`, `lastName`, `dateOfBirth`, and `sex` on file. Both authentication credentials are required.
         */
        put: operations["partners_api_pharmacy_set_pharmacy__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/coverage/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Set user insurance coverage
         * @description Submit or replace the authenticated user's active primary self-coverage record.
         *
         *     The user is identified by `X-Doctronic-User-ID`. Send all required coverage fields on
         *     every request. Repeated requests update the same record and leave unrelated coverage
         *     records unchanged. The user must already have first name, last name, date of birth,
         *     and sex on file.
         *
         *     This endpoint stores coverage information. It does not verify eligibility or benefits,
         *     discover insurance, return or delete coverage, support secondary policies or dependents,
         *     or accept effective dates.
         */
        put: operations["partners_api_coverage_set_coverage__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/artifacts/{artifactId}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a consultation artifact
         * @description Retrieve a consultation artifact: a long summary, short summary, AI SOAP note, or clinician-finalized note.
         *
         *     AI artifact identifiers are delivered in the `ai_consultation.complete` stream event. The clinician note identifier is returned by `GET /appointments/{appointment_id}/result/` after the visit is finalized.
         *
         *     A `200` response contains Markdown in `data.content.body`. A `202` response means generation is still in progress and the client should retry later with bounded backoff. A `404` response means the artifact is unavailable in the authenticated organization and user scope. A `500` response means generation failed.
         */
        get: operations["partners_api_get_artifact_artifacts__artifactId___get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export interface webhooks {
    "appointment.call_ended": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * appointment.call_ended
         * @description The appointment's call ended.
         *
         *     Sent as a signed `POST` to your webhook URL when your organization is subscribed to this event. Every attempt carries the same `eventId`, and events can arrive out of order.
         */
        post: operations["webhook_appointment_call_ended"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "appointment.practitioner_joined": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * appointment.practitioner_joined
         * @description A practitioner joined the appointment's call.
         *
         *     Sent as a signed `POST` to your webhook URL when your organization is subscribed to this event. Every attempt carries the same `eventId`, and events can arrive out of order.
         */
        post: operations["webhook_appointment_practitioner_joined"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "appointment.waiting_room_ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * appointment.waiting_room_ready
         * @description The appointment's waiting room is ready to join. Replace any `waitingRoomUrl` you stored for it earlier.
         *
         *     Sent as a signed `POST` to your webhook URL when your organization is subscribed to this event. Every attempt carries the same `eventId`, and events can arrive out of order.
         */
        post: operations["webhook_appointment_waiting_room_ready"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "artifact.ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * artifact.ready
         * @description A consultation document is ready to retrieve with `GET /artifacts/{artifactId}/`. `userId` can be null.
         *
         *     Sent as a signed `POST` to your webhook URL when your organization is subscribed to this event. Every attempt carries the same `eventId`, and events can arrive out of order.
         */
        post: operations["webhook_artifact_ready"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export interface components {
    schemas: {
        /**
         * AddressRequest
         * @description Request body for setting a user's on-file address (upsert).
         *
         *     All fields are optional individually, but a full address (`line1`, `city`, `state`,
         *     `postalCode`) is required before the user can book an appointment; that is enforced
         *     at booking time. `state` must be a valid US state code.
         */
        AddressRequest: {
            /** @description Required before booking */
            line1?: string | null;
            line2?: string | null;
            /** @description Required before booking */
            city?: string | null;
            /** @description US state code, e.g. 'CA'. Required before booking. */
            state?: string | null;
            /** @description Required before booking */
            postalCode?: string | null;
        };
        /**
         * AddressResponse
         * @description The address currently on file for a user. Any field may be `null` if it was never supplied.
         */
        AddressResponse: {
            line1?: string | null;
            line2?: string | null;
            city?: string | null;
            state?: string | null;
            postalCode?: string | null;
        };
        /**
         * AppointmentAPIStatus
         * @description Appointment status values returned by the Doctronic API. Clients should handle `unknown` without assuming an internal workflow state.
         * @enum {string}
         */
        AppointmentAPIStatus: "booked" | "cancelled" | "fulfilled" | "noshow" | "unknown";
        /**
         * AppointmentResponse
         * @description Appointment response used by list and detail operations. For ASAP appointments, `startsAt` and `endsAt` are `null`. `waitingRoomUrl` is present once a join link is ready, currently expires one hour after issuance, and may rotate when reissued.
         */
        AppointmentResponse: {
            id: string;
            createdAt?: string | null;
            chatId: string;
            status: components["schemas"]["AppointmentAPIStatus"];
            durationMinutes: number;
            location: components["schemas"]["LocationSchema"];
            startsAt?: string | null;
            endsAt?: string | null;
            /**
             * @description Direct HTTPS URL for joining the appointment. Null until the waiting room is ready.
             * @example https://doctronic.doxy.me/example?pid=dc_01K1EXAMPLE00000000000000&autocheckin=true
             */
            waitingRoomUrl?: string | null;
        };
        /** AppointmentResultPendingResponse */
        AppointmentResultPendingResponse: {
            appointmentId: string;
            status: components["schemas"]["AppointmentAPIStatus"];
        };
        /**
         * AppointmentResultPharmacy
         * @description Pharmacy selected for one prescription, as recorded by Canvas at note lock.
         */
        AppointmentResultPharmacy: {
            ncpdpId: string;
            name?: string | null;
            address?: components["schemas"]["AppointmentResultPharmacyAddress"] | null;
            phoneNumber?: string | null;
        };
        /** AppointmentResultPharmacyAddress */
        AppointmentResultPharmacyAddress: {
            line1?: string | null;
            city?: string | null;
            state?: string | null;
            postalCode?: string | null;
        };
        /** AppointmentResultPrescription */
        AppointmentResultPrescription: {
            displayName: string;
            /** @description The destination selected by the clinician for this prescription. This is distinct from the user's preferred pharmacy. */
            pharmacy?: components["schemas"]["AppointmentResultPharmacy"] | null;
        };
        /** AppointmentResultResponse */
        AppointmentResultResponse: {
            appointmentId: string;
            prescriptions: components["schemas"]["AppointmentResultPrescription"][];
            /** @description Stable artifact id for the clinician-finalized note. This is distinct from the pre-visit AI SOAP-note artifact and can be fetched from GET /artifacts/{artifactId}/. */
            clinicianNote?: string | null;
        };
        /** AppointmentWaitingRoomUnavailableData */
        AppointmentWaitingRoomUnavailableData: {
            /** @example dc_01K1EXAMPLE00000000000000 */
            appointmentId: string;
            /**
             * @default booked
             * @constant
             */
            status?: "booked";
        };
        /** ArtifactContent */
        ArtifactContent: {
            chatId: string;
            /** Format: date-time */
            createdAt: string;
            body: string;
        };
        /** ArtifactResponse */
        ArtifactResponse: components["schemas"]["SoapNoteArtifactResponse"] | components["schemas"]["ClinicianNoteArtifactResponse"] | components["schemas"]["LongSummaryArtifactResponse"] | components["schemas"]["ShortSummaryArtifactResponse"];
        /**
         * ArtifactType
         * @description Organization-retrievable consultation artifact kinds.
         * @enum {string}
         */
        ArtifactType: "long_summary" | "short_summary" | "soap_note" | "clinician_note";
        /** AsapAppointmentRequest */
        AsapAppointmentRequest: {
            chatId: string;
            location: components["schemas"]["LocationSchema"];
        };
        /** AsapAppointmentResponse */
        AsapAppointmentResponse: {
            id: string;
            createdAt?: string | null;
            chatId: string;
            status: components["schemas"]["AppointmentAPIStatus"];
            durationMinutes: number;
            location: components["schemas"]["LocationSchema"];
            /**
             * Format: uri
             * @description Direct HTTPS URL for joining the appointment.
             * @example https://doctronic.doxy.me/example?pid=dc_01K1EXAMPLE00000000000000&autocheckin=true
             */
            waitingRoomUrl: string;
        };
        /** AvailableSlotsResponse */
        AvailableSlotsResponse: {
            slots: string[];
        };
        /** ChatResponse */
        ChatResponse: {
            id: string;
            /** Format: date-time */
            createdAt: string;
        };
        /** ClinicianNoteArtifactResponse */
        ClinicianNoteArtifactResponse: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            artifactType: "clinician_note";
            artifactId: string;
            content: components["schemas"]["ArtifactContent"];
        };
        /**
         * CoverageRequest
         * @description Primary insurance coverage supplied for the authenticated user.
         */
        CoverageRequest: {
            /**
             * @description Claim.MD/EDI payer identifier supplied or confirmed during integration setup.
             * @example 00590
             */
            payerId: string;
            /**
             * @description Display name of the insurance payer associated with payerId.
             * @example Example Health Plan
             */
            payerName: string;
            /**
             * @description Insurance member number printed on the patient's plan card; not a Doctronic user ID.
             * @example ABC1234567
             */
            memberId: string;
            /**
             * @description Insurance group number. Omit, set to null, or send a blank value to clear it.
             * @example GROUP-42
             */
            groupNumber?: string | null;
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
        };
        /**
         * CreateUserRequest
         * @description Request body for a user in your organization. All fields are optional at creation time. `firstName`, `lastName`, `dateOfBirth`, and `phoneNumber` are required later for appointment booking. When provided, `dateOfBirth` must represent an age from 18 through 120.
         */
        CreateUserRequest: {
            firstName?: string | null;
            lastName?: string | null;
            /** @description ISO 8601 date */
            dateOfBirth?: string | null;
            email?: string | null;
            /** @description E.164 format, e.g. +15555550100. Required for appointment booking, not account creation. When carrier lookup is enabled, the configured line-type allowlist applies; normally mobile, fixed VoIP and non-fixed VoIP. Landlines are not supported by the default policy. */
            phoneNumber?: string | null;
            /** @description Sex assigned at birth, not gender */
            sex?: components["schemas"]["Sex"] | null;
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
        /** ErrorResponseWithAppointmentWaitingRoomUnavailableData */
        ErrorResponseWithAppointmentWaitingRoomUnavailableData: {
            /** @default error */
            code?: string;
            /** @default  */
            message?: string;
            data?: components["schemas"]["AppointmentWaitingRoomUnavailableData"] | null;
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
        /** LocationSchema */
        LocationSchema: {
            state: components["schemas"]["State"];
        };
        /** LongSummaryArtifactResponse */
        LongSummaryArtifactResponse: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            artifactType: "long_summary";
            artifactId: string;
            content: components["schemas"]["ArtifactContent"];
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
        /** Page[AppointmentResponse] */
        Page_AppointmentResponse_: {
            items: components["schemas"]["AppointmentResponse"][];
            total: number;
            page: number;
            size: number;
            pages: number;
            hasNext: boolean;
            hasPrev: boolean;
        };
        /** Page[ChatResponse] */
        Page_ChatResponse_: {
            items: components["schemas"]["ChatResponse"][];
            total: number;
            page: number;
            size: number;
            pages: number;
            hasNext: boolean;
            hasPrev: boolean;
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
        /**
         * PartnerUserMessageEvent
         * @deprecated
         * @description Deprecated compatibility alias. Use `UserMessageEvent` for new integrations.
         */
        PartnerUserMessageEvent: components["schemas"]["UserMessageEvent"];
        /** Pharmacy */
        Pharmacy: {
            name: string;
            ncpdpId: string;
            address: components["schemas"]["PharmacyAddress"];
            phoneNumber?: string | null;
            distanceMiles?: number | null;
        };
        /** PharmacyAddress */
        PharmacyAddress: {
            line1?: string | null;
            city?: string | null;
            state?: string | null;
            postalCode?: string | null;
        };
        /**
         * PharmacySearchAddress
         * @description Optional narrowing filter for the pharmacy's address, not the patient's.
         */
        PharmacySearchAddress: {
            line1: string;
            line2?: string | null;
            city?: string | null;
            state?: string | null;
            postalCode?: string | null;
        };
        /**
         * PharmacySearchRequest
         * @description Request body for searching pharmacies, used to route any prescriptions resulting
         *     from an appointment.
         *
         *     `latitude` and `longitude` are always required. `search_term` is optional; when
         *     omitted, results are sorted by proximity to the given location. `state` optionally
         *     filters results to a single US state. When `phone_number` is supplied,
         *     search by proximity without a name filter, then compare normalized phones.
         */
        PharmacySearchRequest: {
            /** @description String to search pharmacy name by */
            searchTerm?: string | null;
            /** @description Latitude in WGS84 decimal degrees (e.g. 40.7608), range [-90, 90]. Required. */
            latitude: number;
            /** @description Longitude in WGS84 decimal degrees (e.g. -111.8910), range [-180, 180]. Required. */
            longitude: number;
            /** @description US state code, e.g. 'NY', where the pharmacy is located. */
            state?: string | null;
            /** @description Pharmacy phone, optionally prefixed with +1. Overrides searchTerm; filters nearby Canvas results. */
            phoneNumber?: string | null;
            /** @description Pharmacy address to narrow results. All supplied fields must match; line1 is required. */
            address?: components["schemas"]["PharmacySearchAddress"] | null;
        };
        /** PharmacySearchResponse */
        PharmacySearchResponse: {
            pharmacies: components["schemas"]["Pharmacy"][];
        };
        /**
         * PharmacySetRequest
         * @description Request body for setting the pharmacy on file for the authenticated user (upsert).
         */
        PharmacySetRequest: {
            /** @description NCPDP 7-digit pharmacy ID. Obtained from `POST /pharmacy/search/`. */
            ncpdpId: string;
        };
        /** RatingResponse */
        RatingResponse: {
            score: number;
            scale: string;
        };
        /** RescheduleAppointmentRequest */
        RescheduleAppointmentRequest: {
            /** Format: date-time */
            startsAt: string;
            location: components["schemas"]["LocationSchema"];
        };
        /** ScheduledAppointmentRequest */
        ScheduledAppointmentRequest: {
            chatId: string;
            /** Format: date-time */
            startsAt: string;
            location: components["schemas"]["LocationSchema"];
        };
        /** ScheduledAppointmentResponse */
        ScheduledAppointmentResponse: {
            id: string;
            createdAt?: string | null;
            chatId: string;
            status: components["schemas"]["AppointmentAPIStatus"];
            durationMinutes: number;
            location: components["schemas"]["LocationSchema"];
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
        /** ShortSummaryArtifactResponse */
        ShortSummaryArtifactResponse: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            artifactType: "short_summary";
            artifactId: string;
            content: components["schemas"]["ArtifactContent"];
        };
        /** SoapNoteArtifactResponse */
        SoapNoteArtifactResponse: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            artifactType: "soap_note";
            artifactId: string;
            content: components["schemas"]["ArtifactContent"];
        };
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
        /** SuccessResponseForAddressResponse */
        SuccessResponseForAddressResponse: {
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
            data: components["schemas"]["AddressResponse"];
        };
        /** SuccessResponseForAppointmentResponse */
        SuccessResponseForAppointmentResponse: {
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
            data: components["schemas"]["AppointmentResponse"];
        };
        /** SuccessResponseForAppointmentResultResponse */
        SuccessResponseForAppointmentResultResponse: {
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
            data: components["schemas"]["AppointmentResultResponse"];
        };
        /** SuccessResponseForArtifactResponse */
        SuccessResponseForArtifactResponse: {
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
            data: components["schemas"]["ArtifactResponse"];
        };
        /** SuccessResponseForAsapAppointmentResponse */
        SuccessResponseForAsapAppointmentResponse: {
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
            data: components["schemas"]["AsapAppointmentResponse"];
        };
        /** SuccessResponseForAvailableSlotsResponse */
        SuccessResponseForAvailableSlotsResponse: {
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
            data: components["schemas"]["AvailableSlotsResponse"];
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
        /** SuccessResponseForPage[AppointmentResponse] */
        SuccessResponseForPage_AppointmentResponse_: {
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
            data: components["schemas"]["Page_AppointmentResponse_"];
        };
        /** SuccessResponseForPage[ChatResponse] */
        SuccessResponseForPage_ChatResponse_: {
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
            data: components["schemas"]["Page_ChatResponse_"];
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
        /** SuccessResponseForPharmacySearchResponse */
        SuccessResponseForPharmacySearchResponse: {
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
            data: components["schemas"]["PharmacySearchResponse"];
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
        /** SuccessResponseForScheduledAppointmentResponse */
        SuccessResponseForScheduledAppointmentResponse: {
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
            data: components["schemas"]["ScheduledAppointmentResponse"];
        };
        /** SuccessResponseForUserCreatedResponse */
        SuccessResponseForUserCreatedResponse: {
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
            data: components["schemas"]["UserCreatedResponse"];
        };
        /** SuccessResponse[AppointmentResultPendingResponse] */
        SuccessResponse_AppointmentResultPendingResponse_: {
            /** @default success */
            code?: string;
            /** @default Request successful */
            message?: string;
            data?: components["schemas"]["AppointmentResultPendingResponse"] | null;
        };
        /** SuccessfulEmptyResponse */
        SuccessfulEmptyResponse: {
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
            data?: null;
        };
        /** UpdateRatingMessageRequest */
        UpdateRatingMessageRequest: {
            message: string | null;
        };
        /**
         * UpdateUserRequest
         * @description Only explicitly supplied fields change; null clears a field.
         */
        UpdateUserRequest: {
            firstName?: string | null;
            lastName?: string | null;
            /** @description ISO 8601 date */
            dateOfBirth?: string | null;
            email?: string | null;
            /** @description E.164 format, e.g. +15555550100. Required for appointment booking, not account creation. When carrier lookup is enabled, the configured line-type allowlist applies; normally mobile, fixed VoIP and non-fixed VoIP. Landlines are not supported by the default policy. */
            phoneNumber?: string | null;
            /** @description Sex assigned at birth, not gender */
            sex?: components["schemas"]["Sex"] | null;
        };
        /** UserCreatedResponse */
        UserCreatedResponse: {
            id: string;
            createdAt?: string | null;
            firstName?: string | null;
            lastName?: string | null;
            dateOfBirth?: string | null;
            email?: string | null;
            phoneNumber?: string | null;
            sex?: components["schemas"]["Sex"] | null;
            /** @description Required demographic fields are present. Not a booking authorization or phone-ownership check. */
            appointmentDemographicsComplete: boolean;
            /** @description Missing firstName, lastName, dateOfBirth or phoneNumber. Address and chat readiness are separate. */
            missingAppointmentFields: string[];
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
        /** AppointmentCallEndedData */
        AppointmentCallEndedData: {
            appointmentId: string;
            userId: string;
        };
        /**
         * AppointmentCallEndedPayload
         * @description The appointment's call ended.
         */
        AppointmentCallEndedPayload: {
            /** @description Unique ID of the event, the same on every delivery attempt. Deduplicate on it. */
            eventId: string;
            /**
             * Format: date-time
             * @description When the event happened (UTC), not when this attempt was sent.
             */
            occurredAt: string;
            /**
             * @default appointment.call_ended
             * @constant
             */
            event: "appointment.call_ended";
            data: components["schemas"]["AppointmentCallEndedData"];
        };
        /** AppointmentPractitionerJoinedData */
        AppointmentPractitionerJoinedData: {
            appointmentId: string;
            userId: string;
        };
        /**
         * AppointmentPractitionerJoinedPayload
         * @description A practitioner joined the appointment's call.
         */
        AppointmentPractitionerJoinedPayload: {
            /** @description Unique ID of the event, the same on every delivery attempt. Deduplicate on it. */
            eventId: string;
            /**
             * Format: date-time
             * @description When the event happened (UTC), not when this attempt was sent.
             */
            occurredAt: string;
            /**
             * @default appointment.practitioner_joined
             * @constant
             */
            event: "appointment.practitioner_joined";
            data: components["schemas"]["AppointmentPractitionerJoinedData"];
        };
        /** AppointmentWaitingRoomReadyData */
        AppointmentWaitingRoomReadyData: {
            appointmentId: string;
            userId: string;
            /**
             * Format: uri
             * @description HTTPS URL for joining the appointment; currently expires one hour after issuance and may rotate when reissued.
             * @example https://dctd.co/r/example/
             */
            waitingRoomUrl: string;
        };
        /**
         * AppointmentWaitingRoomReadyPayload
         * @description The appointment's waiting room is ready to join. Replace any `waitingRoomUrl` you stored for it earlier.
         */
        AppointmentWaitingRoomReadyPayload: {
            /** @description Unique ID of the event, the same on every delivery attempt. Deduplicate on it. */
            eventId: string;
            /**
             * Format: date-time
             * @description When the event happened (UTC), not when this attempt was sent.
             */
            occurredAt: string;
            /**
             * @default appointment.waiting_room_ready
             * @constant
             */
            event: "appointment.waiting_room_ready";
            data: components["schemas"]["AppointmentWaitingRoomReadyData"];
        };
        /** ArtifactReadyData */
        ArtifactReadyData: {
            artifactId: string;
            artifactType: components["schemas"]["ArtifactType"];
            chatId: string;
            userId: string | null;
        };
        /**
         * ArtifactReadyPayload
         * @description A consultation document is ready to retrieve with `GET /artifacts/{artifactId}/`. `userId` can be null.
         */
        ArtifactReadyPayload: {
            /** @description Unique ID of the event, the same on every delivery attempt. Deduplicate on it. */
            eventId: string;
            /**
             * Format: date-time
             * @description When the event happened (UTC), not when this attempt was sent.
             */
            occurredAt: string;
            /**
             * @default artifact.ready
             * @constant
             */
            event: "artifact.ready";
            data: components["schemas"]["ArtifactReadyData"];
        };
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
    responses: {
        /** @description The organization Bearer token is missing, invalid, or inactive. */
        AuthenticationError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description The authenticated organization cannot act on the selected user. */
        UserScopeError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    partners_api_users_details_users__get: {
        parameters: {
            query?: never;
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
                    "application/json": components["schemas"]["SuccessResponseForUserCreatedResponse"];
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
                     *         "requiredScope": "patients:read"
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
        };
    };
    partners_api_users_create_users__post: {
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
                "application/json": components["schemas"]["CreateUserRequest"];
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
                    "application/json": components["schemas"]["SuccessResponseForUserCreatedResponse"];
                };
            };
            /** @description A user with this email or phone number already exists. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.user.conflict",
                     *       "message": "A user with this email or phone number already exists."
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
                     *         "requiredScope": "patients:create"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
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
            /** @description Phone validation is temporarily unavailable. Retry the same request later. Idempotent request coordination is temporarily unavailable before processing begins. */
            503: {
                headers: {
                    /** @description Minimum wait in seconds before retrying with the same Idempotency-Key and request body. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    partners_api_users_update_users__patch: {
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
                "application/json": components["schemas"]["UpdateUserRequest"];
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
                    "application/json": components["schemas"]["SuccessResponseForUserCreatedResponse"];
                };
            };
            /** @description The X-Doctronic-User-ID header is required for this endpoint. / A user with this email or phone number already exists. */
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
                     *         "requiredScope": "patients:update"
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
            /** @description Phone validation is temporarily unavailable. Retry the same request later. Idempotent request coordination is temporarily unavailable before processing begins. */
            503: {
                headers: {
                    /** @description Minimum wait in seconds before retrying with the same Idempotency-Key and request body. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    partners_api_chats_list_chats__get: {
        parameters: {
            query?: {
                /** @description Page number */
                page?: number;
                /** @description Items per page */
                size?: number;
                /** @description Order by field with - prefix. Allowed: createdAt, updatedAt */
                orderBy?: string | null;
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
                    "application/json": components["schemas"]["SuccessResponseForPage_ChatResponse_"];
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
    partners_api_appointments_available_slots_appointments_scheduled_available_slots__get: {
        parameters: {
            query: {
                state: string;
                datetimeFrom?: string | null;
                datetimeTo?: string | null;
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
                    "application/json": components["schemas"]["SuccessResponseForAvailableSlotsResponse"];
                };
            };
            /** @description User address on file is incomplete. / User has no address on file. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            401: components["responses"]["AuthenticationError"];
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
                     *         "requiredScope": "appointments:read"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
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
    partners_api_appointments_create_scheduled_appointments_scheduled__post: {
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
                "application/json": components["schemas"]["ScheduledAppointmentRequest"];
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
                    "application/json": components["schemas"]["SuccessResponseForScheduledAppointmentResponse"];
                };
            };
            /** @description Required patient demographics are missing from user record. / User address on file is incomplete. / User has no address on file. / Chat is not ready for appointment booking. / startsAt is not a slot returned by GET /appointments/scheduled/available-slots/. / No practitioners are currently available in the requested state. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            401: components["responses"]["AuthenticationError"];
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
                     *         "requiredScope": "appointments:book"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
                };
            };
            /** @description Chat not found or does not belong to this user. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.appointments.chat_not_found",
                     *       "message": "Chat not found or does not belong to this user."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description The selected slot is no longer available. Idempotency conflict: the key is currently being processed, or it was already used with a different payload. */
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
            /** @description Appointment could not be booked because the clinical service did not accept the request. */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.appointments.provisioning_failed",
                     *       "message": "Appointment could not be booked because the clinical service did not accept the request."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
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
    partners_api_appointments_create_asap_appointments_asap__post: {
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
                "application/json": components["schemas"]["AsapAppointmentRequest"];
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
                    "application/json": components["schemas"]["SuccessResponseForAsapAppointmentResponse"];
                };
            };
            /** @description Required patient demographics are missing from user record. / User address on file is incomplete. / User has no address on file. / Chat is not ready for appointment booking. / No practitioners are currently available in the requested state. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            401: components["responses"]["AuthenticationError"];
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
                     *         "requiredScope": "appointments:book"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
                };
            };
            /** @description Chat not found or does not belong to this user. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.appointments.chat_not_found",
                     *       "message": "Chat not found or does not belong to this user."
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
            /** @description Appointment could not be booked because the clinical service did not accept the request. / Appointment is booked, but a secure waiting-room URL is unavailable. Retrieve this appointment before retrying. */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseWithAppointmentWaitingRoomUnavailableData"];
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
    partners_api_appointments_list_appointments__get: {
        parameters: {
            query?: {
                status?: components["schemas"]["AppointmentAPIStatus"] | null;
                /** @description Page number */
                page?: number;
                /** @description Items per page */
                size?: number;
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
                    "application/json": components["schemas"]["SuccessResponseForPage_AppointmentResponse_"];
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
            401: components["responses"]["AuthenticationError"];
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
                     *         "requiredScope": "appointments:read"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
                };
            };
            /** @description Appointment not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.appointments.not_found",
                     *       "message": "Appointment not found."
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
    partners_api_appointment_details_appointments__appointment_id___get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appointment_id: string;
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
                    "application/json": components["schemas"]["SuccessResponseForAppointmentResponse"];
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
            401: components["responses"]["AuthenticationError"];
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
                     *         "requiredScope": "appointments:read"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
                };
            };
            /** @description Appointment not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.appointments.not_found",
                     *       "message": "Appointment not found."
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
    partners_api_appointment_result_appointments__appointment_id__result__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appointment_id: string;
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
                    "application/json": components["schemas"]["SuccessResponseForAppointmentResultResponse"];
                };
            };
            /** @description Appointment result is not visible yet; retry later. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SuccessResponse_AppointmentResultPendingResponse_"];
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
            401: components["responses"]["AuthenticationError"];
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
                     *         "requiredScope": "appointments:read"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
                };
            };
            /** @description Appointment not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.appointments.not_found",
                     *       "message": "Appointment not found."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Appointment has no available result. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.appointments.result_unavailable",
                     *       "message": "Appointment has no available result."
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
    partners_api_appointments_cancel_appointments__appointment_id__cancel__post: {
        parameters: {
            query?: never;
            header?: {
                /** @description Unique key for safely retrying this mutation for 24 hours. Reuse the same key only with the same request payload. */
                "Idempotency-Key"?: string;
            };
            path: {
                appointment_id: string;
            };
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
                    "application/json": components["schemas"]["SuccessfulEmptyResponse"];
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
            401: components["responses"]["AuthenticationError"];
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
                     *         "requiredScope": "appointments:cancel"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
                };
            };
            /** @description Appointment not found. / Appointment patient not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Appointment cannot be cancelled or rescheduled. Idempotency conflict: the key is currently being processed, or it was already used with a different payload. */
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
    partners_api_appointments_reschedule_appointments__appointment_id__reschedule__post: {
        parameters: {
            query?: never;
            header?: {
                /** @description Unique key for safely retrying this mutation for 24 hours. Reuse the same key only with the same request payload. */
                "Idempotency-Key"?: string;
            };
            path: {
                appointment_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RescheduleAppointmentRequest"];
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
                    "application/json": components["schemas"]["SuccessfulEmptyResponse"];
                };
            };
            /** @description No practitioners are currently available in the requested state. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.appointments.no_practitioners_available",
                     *       "message": "No practitioners are currently available in the requested state."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            401: components["responses"]["AuthenticationError"];
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
                     *         "requiredScope": "appointments:reschedule"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
                };
            };
            /** @description Appointment not found. / Appointment patient not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Appointment cannot be cancelled or rescheduled. / Timeslot unavailable. Idempotency conflict: the key is currently being processed, or it was already used with a different payload. */
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
    partners_api_address_get_address__get: {
        parameters: {
            query?: never;
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
                    "application/json": components["schemas"]["SuccessResponseForAddressResponse"];
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
                     *         "requiredScope": "addresses:read"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
                };
            };
            /** @description User not found. / No address on file for this user. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    partners_api_address_set_address__put: {
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
                "application/json": components["schemas"]["AddressRequest"];
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
                    "application/json": components["schemas"]["SuccessfulEmptyResponse"];
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
                     *         "requiredScope": "addresses:update"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
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
    partners_api_pharmacy_search_pharmacy_search__post: {
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
                "application/json": components["schemas"]["PharmacySearchRequest"];
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
                    "application/json": components["schemas"]["SuccessResponseForPharmacySearchResponse"];
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
                     *         "requiredScope": "pharmacies:search"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
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
    partners_api_pharmacy_set_pharmacy__put: {
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
                "application/json": components["schemas"]["PharmacySetRequest"];
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
                    "application/json": components["schemas"]["SuccessfulEmptyResponse"];
                };
            };
            /** @description Required patient demographics (first name, last name, date of birth, sex) are missing from user record. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.pharmacy.missing_patient_demographics",
                     *       "message": "Required patient demographics (first name, last name, date of birth, sex) are missing from user record."
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
                     *         "requiredScope": "pharmacies:set_preferred"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
                };
            };
            /** @description No pharmacy found for the provided NCPDP id. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.pharmacy.not_found",
                     *       "message": "No pharmacy found for the provided NCPDP id."
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
    partners_api_coverage_set_coverage__put: {
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
                "application/json": components["schemas"]["CoverageRequest"];
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
                    "application/json": components["schemas"]["SuccessfulEmptyResponse"];
                };
            };
            /** @description The X-Doctronic-User-ID header is required for this endpoint. / Required patient demographics (first name, last name, date of birth, sex) are missing from user record. */
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
                     *         "requiredScope": "coverage:update"
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
    partners_api_get_artifact_artifacts__artifactId___get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                artifactId: string;
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
                    "application/json": components["schemas"]["SuccessResponseForArtifactResponse"];
                };
            };
            /** @description Artifact is still being generated; retry later. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
                     *         "requiredScope": "artifacts:read"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponseWithInsufficientScopeData"];
                };
            };
            /** @description User not found. / Artifact not found, does not belong to this organization, or does not belong to the given user. */
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
            /** @description Artifact generation failed permanently. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.internal",
                     *       "message": "Artifact generation failed permanently."
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    webhook_appointment_call_ended: {
        parameters: {
            query?: never;
            header: {
                /** @description Lowercase hexadecimal HMAC-SHA256 of the exact request body bytes, keyed with your webhook secret. Verify it against the raw body before parsing it, with a constant-time comparison. */
                "X-Doctronic-Signature": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppointmentCallEndedPayload"];
            };
        };
        responses: {
            /** @description Retried with exponential backoff while the event's retry window lasts. The window is shorter for `appointment.waiting_room_ready`, and `appointment.waiting_room_ready` and `appointment.practitioner_joined` also stop once the appointment has ended. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Acknowledges the delivery. */
            "2XX": {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A permanent failure: the delivery isn't retried, except after a `429`. */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Any other status, a network failure or a timeout is retried with exponential backoff while the event's retry window lasts. The window is shorter for `appointment.waiting_room_ready`, and `appointment.waiting_room_ready` and `appointment.practitioner_joined` also stop once the appointment has ended. */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    webhook_appointment_practitioner_joined: {
        parameters: {
            query?: never;
            header: {
                /** @description Lowercase hexadecimal HMAC-SHA256 of the exact request body bytes, keyed with your webhook secret. Verify it against the raw body before parsing it, with a constant-time comparison. */
                "X-Doctronic-Signature": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppointmentPractitionerJoinedPayload"];
            };
        };
        responses: {
            /** @description Retried with exponential backoff while the event's retry window lasts. The window is shorter for `appointment.waiting_room_ready`, and `appointment.waiting_room_ready` and `appointment.practitioner_joined` also stop once the appointment has ended. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Acknowledges the delivery. */
            "2XX": {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A permanent failure: the delivery isn't retried, except after a `429`. */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Any other status, a network failure or a timeout is retried with exponential backoff while the event's retry window lasts. The window is shorter for `appointment.waiting_room_ready`, and `appointment.waiting_room_ready` and `appointment.practitioner_joined` also stop once the appointment has ended. */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    webhook_appointment_waiting_room_ready: {
        parameters: {
            query?: never;
            header: {
                /** @description Lowercase hexadecimal HMAC-SHA256 of the exact request body bytes, keyed with your webhook secret. Verify it against the raw body before parsing it, with a constant-time comparison. */
                "X-Doctronic-Signature": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppointmentWaitingRoomReadyPayload"];
            };
        };
        responses: {
            /** @description Retried with exponential backoff while the event's retry window lasts. The window is shorter for `appointment.waiting_room_ready`, and `appointment.waiting_room_ready` and `appointment.practitioner_joined` also stop once the appointment has ended. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Acknowledges the delivery. */
            "2XX": {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A permanent failure: the delivery isn't retried, except after a `429`. */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Any other status, a network failure or a timeout is retried with exponential backoff while the event's retry window lasts. The window is shorter for `appointment.waiting_room_ready`, and `appointment.waiting_room_ready` and `appointment.practitioner_joined` also stop once the appointment has ended. */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    webhook_artifact_ready: {
        parameters: {
            query?: never;
            header: {
                /** @description Lowercase hexadecimal HMAC-SHA256 of the exact request body bytes, keyed with your webhook secret. Verify it against the raw body before parsing it, with a constant-time comparison. */
                "X-Doctronic-Signature": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ArtifactReadyPayload"];
            };
        };
        responses: {
            /** @description Retried with exponential backoff while the event's retry window lasts. The window is shorter for `appointment.waiting_room_ready`, and `appointment.waiting_room_ready` and `appointment.practitioner_joined` also stop once the appointment has ended. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Acknowledges the delivery. */
            "2XX": {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A permanent failure: the delivery isn't retried, except after a `429`. */
            "4XX": {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Any other status, a network failure or a timeout is retried with exponential backoff while the event's retry window lasts. The window is shorter for `appointment.waiting_room_ready`, and `appointment.waiting_room_ready` and `appointment.practitioner_joined` also stop once the appointment has ended. */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
