import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { mapPostgresActivityError } from "@/features/activities/errors";
import {
  activityFailure,
  parseActivityReadModel,
} from "@/features/activities/results";
import type { Database } from "@/lib/supabase/database.types";

import {
  sessionLiveLocationsSchema,
  type RecordLocationSampleRequest,
} from "../contracts";
import { interpretRecordSampleRow, type SampleResult } from "../results";

type Client = SupabaseClient<Database>;

export async function recordLiveLocationSample(
  supabase: Client,
  sessionId: string,
  input: RecordLocationSampleRequest,
): Promise<SampleResult> {
  const { data, error } = await supabase.rpc("record_live_location_sample", {
    target_session_id: sessionId,
    target_client_sample_id: input.clientSampleId,
    sample_lat: input.lat,
    sample_lng: input.lng,
    sample_accuracy_m: input.accuracyM,
    sample_recorded_at: input.recordedAt,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return interpretRecordSampleRow(data?.[0]);
}

export async function getSessionLiveLocations(
  supabase: Client,
  sessionId: string,
) {
  const { data, error } = await supabase.rpc("get_session_live_locations", {
    target_session_id: sessionId,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return parseActivityReadModel(sessionLiveLocationsSchema, data);
}
