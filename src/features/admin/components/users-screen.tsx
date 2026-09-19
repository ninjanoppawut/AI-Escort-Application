"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { adminErrorOf, adminGet, formatAdminDate, withQuery } from "../client";
import {
  adminDirectoryKeys,
  adminPageSchema,
  adminUserSchema,
} from "../directory-contracts";
import { AdminListStatus, FilterChips, LoadMore } from "./admin-list-states";

const TYPE_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "teacher", label: "ครู" },
  { value: "student", label: "นักเรียน" },
] as const;

type TypeOption = (typeof TYPE_OPTIONS)[number]["value"];

const pageSchema = adminPageSchema(adminUserSchema);

/**
 * S-admin Users (ADM-003/ADM-012): teachers and students with school and
 * class membership summaries, 50 per page. Student emails arrive masked;
 * there is no "view as user" and no student content here.
 */
export function UsersScreen() {
  const [type, setType] = useState<TypeOption>("all");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState<string | null>(null);
  const typeFilter = type === "all" ? null : type;
  const query = useInfiniteQuery({
    queryKey: adminDirectoryKeys.users(typeFilter, search),
    queryFn: ({ pageParam }) =>
      adminGet(
        withQuery("/api/admin/users", {
          type: typeFilter,
          q: search,
          cursor: pageParam,
        }),
        pageSchema,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    retry: false,
  });
  const users = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="grid gap-3">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(draft.trim().slice(0, 120) || null);
        }}
        role="search"
      >
        <label className="sr-only" htmlFor="admin-user-search">
          ค้นหาชื่อหรืออีเมล
        </label>
        <input
          className="border-border min-h-11 min-w-0 flex-1 rounded-[10px] border px-3"
          id="admin-user-search"
          maxLength={120}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="ค้นหาชื่อหรืออีเมล"
          value={draft}
        />
        <Button size="lg" type="submit">
          <Search aria-hidden="true" className="size-4" />
          ค้นหา
        </Button>
      </form>
      <FilterChips
        label="ประเภทบัญชี"
        onChange={setType}
        options={TYPE_OPTIONS}
        value={type}
      />
      <AdminListStatus
        empty={users.length === 0}
        emptyText={search ? "ไม่พบผู้ใช้ที่ตรงกับคำค้นหา" : "ยังไม่มีผู้ใช้"}
        error={query.isError ? adminErrorOf(query.error) : null}
        onRestart={() => void query.refetch()}
        onRetry={() => void query.refetch()}
        pending={query.isPending}
      />
      {users.length > 0 ? (
        <ul className="grid gap-2" data-admin-users={users.length}>
          {users.map((user) => (
            <li
              className="border-border bg-card grid gap-1 rounded-xl border p-3 text-sm"
              data-account-type={user.accountType}
              key={user.id}
            >
              <span className="flex flex-wrap items-center gap-2 font-semibold">
                {user.displayName}
                <span className="rounded-full border px-2 text-[12px] font-medium">
                  {user.accountType === "teacher" ? "ครู" : "นักเรียน"}
                </span>
                {user.isAdmin ? (
                  <span className="flex items-center gap-1 rounded-full border border-[#9CC5AE] px-2 text-[12px] font-medium text-[#14472F]">
                    <ShieldCheck aria-hidden="true" className="size-3" />
                    ผู้ดูแลระบบ
                  </span>
                ) : null}
                {user.status === "deactivated" ? (
                  <span className="rounded-full border px-2 text-[12px]">
                    ปิดใช้งาน
                  </span>
                ) : null}
              </span>
              <span className="break-all" data-user-email="">
                {user.email}
              </span>
              <span className="text-muted-foreground text-[13px] leading-5">
                {user.schoolNames.length > 0
                  ? user.schoolNames.join(", ")
                  : "ยังไม่มีโรงเรียน"}{" "}
                · ห้องเรียน {user.classCount} · สมัคร{" "}
                {formatAdminDate(user.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <LoadMore
        hasMore={Boolean(query.hasNextPage)}
        loading={query.isFetchingNextPage}
        onLoad={() => void query.fetchNextPage()}
      />
    </div>
  );
}
