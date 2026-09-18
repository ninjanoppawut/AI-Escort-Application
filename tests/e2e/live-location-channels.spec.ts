import { expect, test } from "@playwright/test";
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import {
  createConfirmedUser,
  getLocalSupabaseEnv,
  queryLocalSql,
  runLocalSql,
  sqlLiteral,
} from "./support/local-supabase";

// P7-03 against the real local Realtime server: private topic joins, who
// receives a student's live position, and the publish stop after pause.

type ChannelOutcome = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

function subscribeOutcome(channel: RealtimeChannel, timeoutMs = 15_000) {
  return new Promise<ChannelOutcome>((resolve) => {
    const timer = setTimeout(() => resolve("TIMED_OUT"), timeoutMs);
    channel.subscribe((status) => {
      if (
        status === "SUBSCRIBED" ||
        status === "CHANNEL_ERROR" ||
        status === "CLOSED" ||
        status === "TIMED_OUT"
      ) {
        clearTimeout(timer);
        resolve(status);
      }
    });
  });
}

function asUserSql(userEmail: string, statement: string) {
  return `
    select set_config(
      'request.jwt.claims',
      jsonb_build_object(
        'sub', (select id from public.profiles where email = ${sqlLiteral(userEmail)}),
        'role', 'authenticated',
        'aal', 'aal1'
      )::text,
      false
    );
    ${statement}
    select set_config('request.jwt.claims', '', false);
  `;
}

async function signedInClient(
  env: Record<string, string>,
  email: string,
  password: string,
) {
  const client = createClient(env.API_URL!, env.PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  expect(error, error?.message).toBeNull();
  await client.realtime.setAuth(data.session!.access_token);
  return client;
}

test.describe("P7-03 live-location channels", () => {
  test.setTimeout(180_000);

  test("only the owner publishes, only the teacher listens, and pause stops publishing", async ({
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "teacher-desktop-chromium",
      "Realtime channel checks run once against the local Supabase stack.",
    );

    const env = getLocalSupabaseEnv();
    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const teacherEmail = `p7-live-teacher-${suffix}@example.edu`;
    const a1Email = `p7-live-a1-${suffix}@example.edu`;
    const a2Email = `p7-live-a2-${suffix}@example.edu`;
    const a3Email = `p7-live-a3-${suffix}@example.edu`;
    const emails = [teacherEmail, a1Email, a2Email, a3Email];
    const emailList = emails.map(sqlLiteral).join(", ");
    const password = "live location passphrase 1";
    const schoolId = randomUUID();
    const classId = randomUUID();
    const activityId = randomUUID();
    const versionId = randomUUID();

    for (const email of emails) {
      await createConfirmedUser(request, env, email, password);
    }

    runLocalSql(`
      update public.profiles set email_verified_at = now() where email in (${emailList});
      update auth.identities
      set identity_data = identity_data || jsonb_build_object('email_verified', true)
      where user_id in (select id from public.profiles where email in (${emailList}));
      update public.profiles set account_type = 'teacher' where email = ${sqlLiteral(teacherEmail)};

      insert into public.schools (id, name, created_by)
      select '${schoolId}'::uuid, 'Live School', id from public.profiles where email = ${sqlLiteral(teacherEmail)};
      insert into public.school_memberships (school_id, user_id, role)
      select '${schoolId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});
      insert into public.classes (
        id, school_id, name, min_group_size, max_group_size, maximum_groups,
        allow_student_groups, group_formation_status, created_by
      )
      select '${classId}'::uuid, '${schoolId}'::uuid, 'Live Class', 1, 4, 3, true, 'open', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};
      insert into public.class_members (class_id, user_id, role)
      select '${classId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});
    `);

    runLocalSql(
      asUserSql(
        a1Email,
        `select * from public.create_student_group('${classId}'::uuid, 'Leaf', null);`,
      ) +
        asUserSql(
          a3Email,
          `select * from public.create_student_group('${classId}'::uuid, 'Root', null);`,
        ),
    );

    runLocalSql(`
      insert into public.group_members (class_id, group_id, user_id, role, invited_by)
      select '${classId}'::uuid, grouped.id, a2.id, 'member', a1.id
      from public.groups as grouped
      cross join public.profiles as a2
      cross join public.profiles as a1
      where grouped.class_id = '${classId}'::uuid and grouped.name = 'Leaf'
        and a2.email = ${sqlLiteral(a2Email)} and a1.email = ${sqlLiteral(a1Email)};

      insert into public.activities (id, class_id, title, status, created_by)
      select '${activityId}'::uuid, '${classId}'::uuid, 'Garden survey', 'published', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};
      insert into public.activity_versions (id, activity_id, class_id, version_number, title, created_by)
      select '${versionId}'::uuid, '${activityId}'::uuid, '${classId}'::uuid, 1, 'Garden survey', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};
      insert into public.activity_boundaries (activity_version_id, boundary)
      values ('${versionId}'::uuid, extensions.st_geomfromtext(
        'POLYGON((100.50 13.75, 100.51 13.75, 100.51 13.76, 100.50 13.76, 100.50 13.75))', 4326));
      update public.activity_versions as version
      set status = 'published', published_at = now(), published_by = profile.id
      from public.profiles as profile
      where version.id = '${versionId}'::uuid and profile.email = ${sqlLiteral(teacherEmail)};
    `);

    const teacher = await signedInClient(env, teacherEmail, password);
    const a1 = await signedInClient(env, a1Email, password);
    const a2 = await signedInClient(env, a2Email, password);
    const a3 = await signedInClient(env, a3Email, password);
    const clients: SupabaseClient[] = [teacher, a1, a2, a3];

    try {
      const created = await teacher.rpc("create_exploration_session", {
        target_activity_id: activityId,
        session_title: "Morning round",
      });
      expect(created.error?.message).toBeUndefined();
      const sessionId = (created.data as Array<{ session_id: string }>)[0]!
        .session_id;

      const groups = await teacher
        .from("groups")
        .select("id, name")
        .eq("class_id", classId);
      const groupId = (name: string) =>
        groups.data!.find((group) => group.name === name)!.id as string;

      const opened = await teacher.rpc("open_exploration_session", {
        target_session_id: sessionId,
        group_order: [groupId("Leaf"), groupId("Root")],
      });
      expect(opened.error?.message).toBeUndefined();
      const activated = await teacher.rpc("activate_session_group", {
        target_session_id: sessionId,
        target_group_id: groupId("Leaf"),
      });
      expect(activated.error?.message).toBeUndefined();

      const ids = Object.fromEntries(
        queryLocalSql(
          `select email || '|' || id from public.profiles where email in (${emailList});`,
        )
          .split(/\r?\n/)
          .map((line) => line.trim().split("|") as [string, string]),
      );
      const locationTopic = (email: string) =>
        `session:${sessionId}:location:${ids[email]}`;

      // The teacher listens on a1's topic and receives a1's broadcast.
      const received: unknown[] = [];
      const teacherView = teacher
        .channel(locationTopic(a1Email), { config: { private: true } })
        .on("broadcast", { event: "location.sample" }, (message) => {
          received.push(message.payload);
        });
      expect(await subscribeOutcome(teacherView)).toBe("SUBSCRIBED");

      const a1Channel = a1.channel(locationTopic(a1Email), {
        config: { private: true, broadcast: { self: false } },
      });
      expect(await subscribeOutcome(a1Channel)).toBe("SUBSCRIBED");

      const sample = {
        type: "location.sample",
        version: 1,
        sessionId,
        seq: 1,
        lat: 13.755,
        lng: 100.505,
        accuracyM: 8,
        headingDeg: null,
        speedMps: null,
        recordedAt: new Date().toISOString(),
      };
      await expect
        .poll(
          async () => {
            await a1Channel.send({
              type: "broadcast",
              event: "location.sample",
              payload: sample,
            });
            return received.length;
          },
          { timeout: 15_000, intervals: [500, 1_000, 2_000] },
        )
        .toBeGreaterThan(0);
      expect(received[0]).toMatchObject({ lat: 13.755, lng: 100.505 });

      // A groupmate cannot join a1's topic; a waiting student cannot join their own.
      expect(
        await subscribeOutcome(
          a2.channel(locationTopic(a1Email), { config: { private: true } }),
        ),
      ).not.toBe("SUBSCRIBED");
      expect(
        await subscribeOutcome(
          a3.channel(locationTopic(a3Email), { config: { private: true } }),
        ),
      ).not.toBe("SUBSCRIBED");

      // Pause: the teachers topic signals it and a fresh publish join is refused.
      const signals: string[] = [];
      const teacherSignals = teacher
        .channel(`session:${sessionId}:teachers`, { config: { private: true } })
        .on("broadcast", { event: "session.status_changed" }, (message) => {
          signals.push(String(message.payload.type));
        });
      expect(await subscribeOutcome(teacherSignals)).toBe("SUBSCRIBED");

      const paused = await teacher.rpc("pause_exploration_session", {
        target_session_id: sessionId,
      });
      expect(paused.error?.message).toBeUndefined();
      await expect
        .poll(() => signals.length, { timeout: 10_000 })
        .toBeGreaterThan(0);

      const a1Fresh = createClient(env.API_URL!, env.PUBLISHABLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      clients.push(a1Fresh);
      const { data } = await a1Fresh.auth.signInWithPassword({
        email: a1Email,
        password,
      });
      await a1Fresh.realtime.setAuth(data.session!.access_token);
      expect(
        await subscribeOutcome(
          a1Fresh.channel(locationTopic(a1Email), {
            config: { private: true },
          }),
        ),
      ).not.toBe("SUBSCRIBED");

      const refused = await a1.rpc("record_live_location_sample", {
        target_session_id: sessionId,
        target_client_sample_id: randomUUID(),
        sample_lat: 13.755,
        sample_lng: 100.505,
        sample_accuracy_m: 8,
        sample_recorded_at: new Date().toISOString(),
      });
      expect(
        (refused.data as Array<{ error_code: string }> | null)?.[0]?.error_code,
      ).toBe("SESSION_PAUSED");
    } finally {
      for (const client of clients) await client.removeAllChannels();
    }
  });
});
