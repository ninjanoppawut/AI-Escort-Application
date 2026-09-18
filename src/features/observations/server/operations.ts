import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  observationDraftSchema,
  sessionObservationsSchema,
  type StartObservationRequest,
  type UpdateObservationDraftRequest,
} from "../contracts";
import { mapPostgresObservationError } from "../errors";
import {
  interpretStartObservationRow,
  interpretUpdateDraftRow,
  observationFailure,
  parseObservationReadModel,
} from "../results";

type Client = SupabaseClient<Database>;

export async function startObservation(
  supabase: Client,
  input: StartObservationRequest,
) {
  const capture = input.capture;
  const { data, error } = await supabase.rpc("start_observation", {
    target_session_id: input.sessionId,
    target_client_generated_id: input.clientGeneratedId,
    capture_location_status: capture.locationStatus,
    capture_lat: capture.locationStatus === "captured" ? capture.lat : null,
    capture_lng: capture.locationStatus === "captured" ? capture.lng : null,
    capture_accuracy_m:
      capture.locationStatus === "captured" ? capture.accuracyM : null,
    capture_captured_at: capture.capturedAt,
    capture_unavailable_reason:
      capture.locationStatus === "unavailable"
        ? capture.unavailableReason
        : null,
  } as Database["public"]["Functions"]["start_observation"]["Args"]);
  if (error) {
    return observationFailure(mapPostgresObservationError(error.message));
  }
  return interpretStartObservationRow(data?.[0]);
}

export async function updateObservationDraft(
  supabase: Client,
  observationId: string,
  input: UpdateObservationDraftRequest,
) {
  const { data, error } = await supabase.rpc("update_observation_draft", {
    target_observation_id: observationId,
    expected_version: input.expectedVersion,
    draft_common_name: input.commonName,
    draft_scientific_name: input.scientificName,
    draft_evidence_note: input.evidenceNote,
  } as Database["public"]["Functions"]["update_observation_draft"]["Args"]);
  if (error) {
    return observationFailure(mapPostgresObservationError(error.message));
  }
  return interpretUpdateDraftRow(data?.[0]);
}

export async function getObservationDraft(
  supabase: Client,
  observationId: string,
) {
  const { data, error } = await supabase.rpc("get_observation_draft", {
    target_observation_id: observationId,
  });
  if (error) {
    return observationFailure(mapPostgresObservationError(error.message));
  }
  return parseObservationReadModel(observationDraftSchema, data);
}

export async function listSessionObservations(
  supabase: Client,
  sessionId: string,
) {
  const { data, error } = await supabase.rpc("list_my_session_observations", {
    target_session_id: sessionId,
  });
  if (error) {
    return observationFailure(mapPostgresObservationError(error.message));
  }
  return parseObservationReadModel(sessionObservationsSchema, data);
}
