import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { afterLoginPath } from "@/lib/auth-destination";
import { getSupabaseConfig } from "@/utils/supabase/config";

export const createClient = async (request: NextRequest) => {
  const { url, publishableKey } = getSupabaseConfig();
  let supabaseResponse = NextResponse.next({ request });

  function privateResponse(response: NextResponse) {
    supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  }

  function redirect(path: string) {
    return privateResponse(NextResponse.redirect(new URL(path, request.url)));
  }

  function unavailable() {
    return privateResponse(new NextResponse(
      "Не удалось проверить вход в Brick Studio. Обновите страницу через несколько секунд.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "5" } },
    ));
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const response = NextResponse.next({ request });
        supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        for (const key of ["Cache-Control", "Expires", "Pragma"]) {
          const previous = supabaseResponse.headers.get(key);
          if (previous) response.headers.set(key, previous);
        }
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        supabaseResponse = response;
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const userId = error ? null : data?.claims.sub;
  const path = request.nextUrl.pathname;
  const registerPage = path === "/register" && !request.nextUrl.searchParams.has("student");
  const loginPage = path === "/login";
  const uploadPage = path === "/admin/instructions/drive";
  const protectedPage = path === "/map" || uploadPage || path === "/dashboard" || path === "/editor"
    || path === "/instructions" || path.startsWith("/instructions/");

  if (protectedPage || registerPage || loginPage) {
    if (error && (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500)) return unavailable();
    if (userId) {
      const { data: profile, error: profileError } = await supabase.from("profiles")
        .select("onboarding_complete,role").eq("id", userId).maybeSingle();
      if (profileError || !profile) return unavailable();
      if (profile.onboarding_complete) {
        if (protectedPage && profile.role === "parent") return redirect("/profile");
        if (registerPage || loginPage) {
          return redirect(profile.role === "parent" ? "/profile" : afterLoginPath(request.nextUrl.searchParams.get("next")));
        }
        if (uploadPage && profile.role !== "teacher") {
          const permission = await supabase.rpc("is_instruction_admin");
          if (permission.error) return unavailable();
          if (permission.data !== true) return redirect("/dashboard");
        }
      } else if (protectedPage) {
        return redirect("/register");
      }
    } else if (protectedPage) {
      const search = new URLSearchParams({ next: path + request.nextUrl.search });
      return redirect(`/login?${search}`);
    }
  }

  if (protectedPage || registerPage || loginPage) {
    supabaseResponse.headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  return supabaseResponse;
};
