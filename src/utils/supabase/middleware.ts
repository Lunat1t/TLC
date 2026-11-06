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

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const uploadPage = path === "/admin/instructions/drive";
  const protectedPage = uploadPage || path === "/dashboard" || path === "/editor" || path === "/instructions" || path.startsWith("/instructions/");
  if (protectedPage) {
    let complete = false;
    if (user) {
      const { data } = await supabase.from("profiles").select("onboarding_complete,role").eq("id", user.id).maybeSingle();
      complete = data?.onboarding_complete === true;
      if (complete && data?.role === "parent") {
        const response = NextResponse.redirect(new URL("/profile", request.url));
        supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
        return response;
      }
      if (complete && uploadPage && data?.role !== "teacher") {
        const permission = await supabase.rpc("is_instruction_admin");
        if (permission.error || permission.data !== true) {
          const response = NextResponse.redirect(new URL("/dashboard", request.url));
          supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
          return response;
        }
      }
    }
    if (!complete) {
      const response = NextResponse.redirect(new URL("/register", request.url));
      supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
      return response;
    }
  }

  return supabaseResponse;
};
