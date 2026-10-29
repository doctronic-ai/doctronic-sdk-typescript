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

export type Appointment = components['schemas']['AppointmentResponse'];
export type AppointmentStatus = components['schemas']['AppointmentAPIStatus'];
export type AppointmentPage = components['schemas']['Page_AppointmentResponse_'];
export type ScheduledAppointment = components['schemas']['ScheduledAppointmentResponse'];
export type AsapAppointment = components['schemas']['AsapAppointmentResponse'];
export type AppointmentResult = components['schemas']['AppointmentResultResponse'];
export type AvailableSlots = components['schemas']['AvailableSlotsResponse'];
export type UsState = components['schemas']['State'];
export type AvailableSlotsParams = QueryParams<'GET /appointments/scheduled/available-slots/'>;
export type ListAppointmentsParams = QueryParams<'GET /appointments/'>;
export type CreateScheduledAppointmentParams = RequestBody<'POST /appointments/scheduled/'>;
export type CreateAsapAppointmentParams = RequestBody<'POST /appointments/asap/'>;
export type RescheduleAppointmentParams =
  RequestBody<'POST /appointments/{appointment_id}/reschedule/'>;

export class AppointmentsResource {
  readonly #transport: Transport;
  readonly #userId: string;

  /** @internal */
  constructor(transport: Transport, userId: string) {
    this.#transport = transport;
    this.#userId = userId;
  }

  /** `GET /appointments/scheduled/available-slots/`: slots for practitioners in `state`. */
  availableSlots(
    query: AvailableSlotsParams,
    options?: RequestOptions,
  ): APIPromise<ResponseData<'GET /appointments/scheduled/available-slots/', 200>> {
    return this.#transport.request('GET /appointments/scheduled/available-slots/', {
      query,
      userId: this.#userId,
      options,
    });
  }

  /**
   * `POST /appointments/scheduled/`: book a slot from `availableSlots()`. On
   * `409 error.appointments.slot_unavailable`, refresh availability and ask the patient again.
   */
  createScheduled(
    body: CreateScheduledAppointmentParams,
    options?: IdempotentRequestOptions,
  ): APIPromise<ResponseData<'POST /appointments/scheduled/', 201>> {
    return this.#transport.request('POST /appointments/scheduled/', {
      body,
      userId: this.#userId,
      options,
    });
  }

  /**
   * `POST /appointments/asap/`: join the next available queue. On
   * `502 error.appointments.waiting_room_unavailable` the appointment exists; `error.data` holds
   * its `appointmentId`, so retrieve it before retrying.
   */
  createAsap(
    body: CreateAsapAppointmentParams,
    options?: IdempotentRequestOptions,
  ): APIPromise<ResponseData<'POST /appointments/asap/', 201>> {
    return this.#transport.request('POST /appointments/asap/', {
      body,
      userId: this.#userId,
      options,
    });
  }

  /** `GET /appointments/`. */
  list(
    query: ListAppointmentsParams = {},
    options?: RequestOptions,
  ): APIPromise<ResponseData<'GET /appointments/', 200>> {
    return this.#transport.request('GET /appointments/', { query, userId: this.#userId, options });
  }

  /** `GET /appointments/{appointment_id}/`. */
  retrieve(
    appointmentId: string,
    options?: RequestOptions,
  ): APIPromise<ResponseData<'GET /appointments/{appointment_id}/', 200>> {
    return this.#transport.request('GET /appointments/{appointment_id}/', {
      pathParams: { appointment_id: appointmentId },
      userId: this.#userId,
      options,
    });
  }

  /**
   * `GET /appointments/{appointment_id}/result/`: what the clinician recorded. Resolves to `null`
   * while the result isn't available yet (`202`). Rejects with a `ConflictError`
   * (`error.appointments.result_unavailable`) when no result will exist.
   */
  result(
    appointmentId: string,
    options?: RequestOptions,
  ): APIPromise<ResponseData<'GET /appointments/{appointment_id}/result/', 200> | null> {
    return this.#transport.request('GET /appointments/{appointment_id}/result/', {
      pathParams: { appointment_id: appointmentId },
      userId: this.#userId,
      options,
    });
  }

  /** `POST /appointments/{appointment_id}/cancel/`. */
  cancel(
    appointmentId: string,
    options?: IdempotentRequestOptions,
  ): APIPromise<ResponseData<'POST /appointments/{appointment_id}/cancel/', 200>> {
    return this.#transport.request('POST /appointments/{appointment_id}/cancel/', {
      pathParams: { appointment_id: appointmentId },
      userId: this.#userId,
      options,
    });
  }

  /** `POST /appointments/{appointment_id}/reschedule/`: move a booked appointment. */
  reschedule(
    appointmentId: string,
    body: RescheduleAppointmentParams,
    options?: IdempotentRequestOptions,
  ): APIPromise<ResponseData<'POST /appointments/{appointment_id}/reschedule/', 200>> {
    return this.#transport.request('POST /appointments/{appointment_id}/reschedule/', {
      pathParams: { appointment_id: appointmentId },
      body,
      userId: this.#userId,
      options,
    });
  }
}
