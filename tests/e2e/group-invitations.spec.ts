import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import {
  createConfirmedUser,
  expectNoHorizontalOverflow,
  getLocalSupabaseEnv,
  queryLocalSql,
  runLocalSql,
  signIn,
  sqlLiteral,
} from "./support/local-supabase";

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

async function signInAt(
  page: Page,
  path: string,
  email: string,
  password: string,
) {
  await page.goto(path);
  await page.waitForURL(/\/auth\/sign-in\?/);
  await signIn(page, email, password);
  await page.waitForURL(new RegExp(`${path}$`));
}

test.describe("P4 consent-based group invitations", () => {
  test.setTimeout(240_000);

  test("leader invites from group detail, invitee races two acceptances, and exactly one join commits", async ({
    browser,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P4 invitation journey runs once against the local Supabase stack.",
    );

    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const teacherEmail = `invite-teacher-${suffix}@example.edu`;
    const leaderEmail = `invite-leader-${suffix}@example.edu`;
    const otherLeaderEmail = `invite-other-leader-${suffix}@example.edu`;
    const inviteeEmail = `invite-invitee-${suffix}@example.edu`;
    const emails = [teacherEmail, leaderEmail, otherLeaderEmail, inviteeEmail];
    const password = "group invite passphrase 1";
    const env = getLocalSupabaseEnv();
    const schoolId = randomUUID();
    const classId = randomUUID();

    for (const email of emails) {
      await createConfirmedUser(request, env, email, password);
    }

    const emailList = emails.map(sqlLiteral).join(", ");
    runLocalSql(`
      update public.profiles set email_verified_at = now() where email in (${emailList});
      update auth.identities
      set identity_data = identity_data || jsonb_build_object('email_verified', true)
      where user_id in (select id from public.profiles where email in (${emailList}));

      update public.profiles set account_type = 'teacher' where email = ${sqlLiteral(teacherEmail)};
      update public.profiles set display_name = 'Ada Leader' where email = ${sqlLiteral(leaderEmail)};
      update public.profiles set display_name = 'Eve Leader' where email = ${sqlLiteral(otherLeaderEmail)};
      update public.profiles set display_name = 'Bo Invitee' where email = ${sqlLiteral(inviteeEmail)};

      insert into public.schools (id, name, created_by)
      select '${schoolId}'::uuid, 'Invitation School', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};

      insert into public.school_memberships (school_id, user_id, role)
      select '${schoolId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});

      insert into public.classes (
        id, school_id, name, min_group_size, max_group_size, maximum_groups,
        allow_student_groups, group_formation_status, created_by
      )
      select '${classId}'::uuid, '${schoolId}'::uuid, 'Invitation Class', 2, 3, 3,
        true, 'open', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};

      insert into public.class_members (class_id, user_id, role)
      select '${classId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});
    `);

    runLocalSql(
      asUserSql(
        leaderEmail,
        `select * from public.create_student_group('${classId}'::uuid, 'Leaf Team', null);`,
      ) +
        asUserSql(
          otherLeaderEmail,
          `select * from public.create_student_group('${classId}'::uuid, 'Root Team', null);`,
        ),
    );

    const groupIds = queryLocalSql(`
      select string_agg(id::text, ',' order by name)
      from public.groups where class_id = '${classId}'::uuid;
    `).split(",");
    const leafGroupId = groupIds[0]!;
    const rootGroupId = groupIds[1]!;

    const leaderContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const inviteeContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });

    try {
      // Leader invites from the group detail screen.
      const leader = await leaderContext.newPage();
      const leafPath = `/classes/${classId}/groups/${leafGroupId}`;
      await signInAt(leader, leafPath, leaderEmail, password);
      await expect(
        leader.getByRole("heading", { name: "Leaf Team" }),
      ).toBeVisible();
      await expect(leader.getByText("อัปเดตสดอยู่")).toBeVisible({
        timeout: 30_000,
      });
      await leader.getByRole("button", { name: "ชวนเพื่อนร่วมชั้น" }).click();
      const panel = leader.getByRole("region", { name: "ชวนเพื่อนร่วมชั้น" });
      await panel.getByRole("button", { name: "ชวน Bo Invitee" }).click();
      await expect(
        panel.getByText("ส่งคำเชิญถึง Bo Invitee แล้ว"),
      ).toBeVisible();
      await expect(
        leader.getByRole("heading", { name: "รอตอบรับ 1 คน" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(leader);

      // A second group also invites the same student.
      runLocalSql(
        asUserSql(
          otherLeaderEmail,
          `select * from public.send_group_invitation('${rootGroupId}'::uuid,
            (select id from public.profiles where email = ${sqlLiteral(inviteeEmail)}));`,
        ),
      );

      const invitationIds = queryLocalSql(`
        select string_agg(invitation.id::text, ',' order by grouped.name)
        from public.group_invitations as invitation
        join public.groups as grouped on grouped.id = invitation.group_id
        where invitation.class_id = '${classId}'::uuid and invitation.status = 'pending';
      `).split(",");
      expect(invitationIds).toHaveLength(2);

      // Invitee sees both invitations on the board.
      const invitee = await inviteeContext.newPage();
      const boardPath = `/classes/${classId}/groups`;
      await signInAt(invitee, boardPath, inviteeEmail, password);
      await expect(
        invitee.getByRole("heading", { name: "คำเชิญที่ได้รับ (2)" }),
      ).toBeVisible();
      await invitee
        .getByRole("link", { name: "ดูคำเชิญจาก Leaf Team" })
        .click();
      await invitee.waitForURL(
        new RegExp(`/group-invitations/${invitationIds[0]}$`),
      );
      await expect(invitee.getByText("ที่นั่งคงเหลือ 2 จาก 3")).toBeVisible();
      await expect(
        invitee
          .getByText("หมดอายุใน 23 ชั่วโมง")
          .or(invitee.getByText("หมดอายุใน 24 ชั่วโมง")),
      ).toBeVisible();
      await expectNoHorizontalOverflow(invitee);

      const second = await inviteeContext.newPage();
      await second.goto(`/group-invitations/${invitationIds[1]}`);
      await expect(
        second.getByRole("button", { name: "ตอบรับคำเชิญ" }),
      ).toBeEnabled();

      // Accept both invitations at the same time.
      await Promise.all([
        invitee.getByRole("button", { name: "ตอบรับคำเชิญ" }).click(),
        second.getByRole("button", { name: "ตอบรับคำเชิญ" }).click(),
      ]);

      const outcomes = await Promise.all(
        [invitee, second].map(async (page) => {
          const joined = page.getByText(/^เข้ากลุ่ม .+ แล้ว$/);
          const refused = page.getByText(
            /คำเชิญนี้ถูกยกเลิกแล้ว|คำเชิญนี้ดำเนินการแล้ว|คุณอยู่กลุ่มอื่นแล้ว|คุณอยู่ในกลุ่มแล้ว/,
          );
          // The first acceptance may wait for next dev to compile the route.
          await expect(joined.or(refused).first()).toBeVisible({
            timeout: 30_000,
          });
          return (await joined.isVisible()) ? "joined" : "refused";
        }),
      );
      expect([...outcomes].sort()).toEqual(["joined", "refused"]);

      const joinedGroup = queryLocalSql(`
        select string_agg(grouped.name, ',')
        from public.group_members as member
        join public.groups as grouped on grouped.id = member.group_id
        where member.class_id = '${classId}'::uuid
          and member.status = 'active'
          and member.user_id = (select id from public.profiles where email = ${sqlLiteral(inviteeEmail)});
      `);
      expect(["Leaf Team", "Root Team"]).toContain(joinedGroup);
      expect(
        queryLocalSql(`
          select count(*) from public.group_invitations
          where class_id = '${classId}'::uuid and status = 'pending';
        `),
      ).toBe("0");

      // The leader's open detail screen refreshes from the private signal.
      if (joinedGroup === "Leaf Team") {
        await expect(
          leader
            .getByRole("region", { name: "สมาชิก" })
            .getByText("Bo Invitee"),
        ).toBeVisible({
          timeout: 15_000,
        });
        await expect(
          leader.getByRole("heading", { name: "รอตอบรับ 0 คน" }),
        ).toBeVisible();
      } else {
        await expect(
          leader.getByRole("heading", { name: "รอตอบรับ 0 คน" }),
        ).toBeVisible({
          timeout: 15_000,
        });
      }
    } finally {
      await leaderContext.close();
      await inviteeContext.close();
    }
  });
});
