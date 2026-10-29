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
         *     **Auth:** organization Bearer token + `X-Doctronic-User-ID` header (both required).
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
         *     - `error`: an error; the stream ends after it. `errorCode` is `error.rate_limited`
         *       (may include `retryAfterSeconds`), `error.internal` (the reply failed; retry the turn), or
         *       `error.consultation_not_ready` (the consultation could not be finalized; booking is
         *       unavailable).
         *     - `skill_code.cta`: an end-of-flow call to action (e.g. see a Doctronic doctor, or book
         *       an in-person visit); carries `skillCode`, `widget`, and an optional `text` label.
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
         *     `404 error.partner.chat_not_found`.
         *
         *     **Auth:** organization Bearer token + `X-Doctronic-User-ID` header (both required).
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
export type webhooks = Record<string, never>;
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
         * PharmacySearchRequest
         * @description Request body for searching pharmacies, used to route any prescriptions resulting
         *     from an appointment.
         *
         *     `latitude` and `longitude` are always required. `search_term` is optional; when
         *     omitted, results are sorted by proximity to the given location. `state` optionally
         *     filters results to a single US state.
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
        /** StreamChatRequest */
        StreamChatRequest: {
            userEvent: components["schemas"]["UserMessageEvent"];
            /** @default UTC */
            timezone?: string;
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
                content?: never;
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
            /** @description Phone validation is temporarily unavailable. Retry the same request later. */
            503: {
                headers: {
                    /** @description Minimum wait in seconds before retrying with the same Idempotency-Key and request body. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.validation.phone_number.unavailable",
                     *       "message": "Phone validation is temporarily unavailable. Retry the same request later."
                     *     }
                     */
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
                content?: never;
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
            /** @description Phone validation is temporarily unavailable. Retry the same request later. */
            503: {
                headers: {
                    /** @description Minimum wait in seconds before retrying with the same Idempotency-Key and request body. */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "error.validation.phone_number.unavailable",
                     *       "message": "Phone validation is temporarily unavailable. Retry the same request later."
                     *     }
                     */
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
                content?: never;
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
                content?: never;
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
                    /**
                     * @example {
                     *       "code": "error.appointments.slot_unavailable",
                     *       "message": "The selected slot is no longer available."
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
                content?: never;
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
                content?: never;
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
                content?: never;
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
                    /**
                     * @example {
                     *       "code": "error.appointments.cannot_be_cancelled_or_rescheduled",
                     *       "message": "Appointment cannot be cancelled or rescheduled."
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
                content?: never;
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
                    "application/json": unknown;
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
                content?: never;
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
                content?: never;
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
                content?: never;
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
                content?: never;
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
                    "application/json": unknown;
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
                content?: never;
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
                content?: never;
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
                content?: never;
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
                content?: never;
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
}
