import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig } from "@/utils/supabase/config";

export const createClient = async (request: NextRequest) => {
  const { url, publishableKey } = getSupabaseConfig();
  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    url,
    publishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Verify the JWT signature (and refresh expired tokens), rather than fetch the
  // full auth user on every navigation. RLS still checks every database request.
  const { data, error } = await supabase.auth.getClaims();
  const userId = error ? null : data?.claims.sub;
  const path = request.nextUrl.pathname;
  const registerPage = path === "/register" && !request.nextUrl.searchParams.has("student");
  const loginPage = path === "/login";
  const uploadPage = path === "/admin/instructions/drive";
  const protectedPage = path === "/map" || uploadPage || path === "/dashboard" || path === "/editor" || path === "/instructions" || path.startsWith("/instructions/");
  if (protectedPage || registerPage || loginPage) {
    let complete = false;
    let role: string | null = null;
    if (userId) {
      const { data } = await supabase.from("profiles").select("onboarding_complete,role").eq("id", userId).maybeSingle();
      complete = data?.onboarding_complete === true;
      role = data?.role ?? null;
      if ((registerPage || loginPage) && complete) {
        const response = NextResponse.redirect(new URL(role === "parent" ? "/profile" : "/dashboard", request.url));
        supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
        return response;
      }
      if (protectedPage && complete && role === "parent") {
        const response = NextResponse.redirect(new URL("/profile", request.url));
        supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
        return response;
      }
      if (protectedPage && complete && uploadPage && role !== "teacher") {
        const permission = await supabase.rpc("is_instruction_admin");
        if (permission.error || permission.data !== true) {
          const response = NextResponse.redirect(new URL("/dashboard", request.url));
          supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
          return response;
        }
      }
    }
    if (protectedPage && !complete) {
      const response = NextResponse.redirect(new URL("/register", request.url));
      supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
      return response;
    }
  }

  return supabaseResponse;
};
