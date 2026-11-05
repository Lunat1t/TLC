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
  const protectedPage = path === "/" || path === "/editor" || path === "/instructions" || path.startsWith("/instructions/");
  if (protectedPage) {
    let complete = false;
    if (user) {
      const { data } = await supabase.from("profiles").select("onboarding_complete,role").eq("id", user.id).maybeSingle();
      complete = data?.onboarding_complete === true;
      if (complete && data?.role === "parent") {
        const links = await supabase.from("parent_student_links").select("student_id", { count: "exact", head: true }).eq("parent_id", user.id);
        if (!links.count) {
          const response = NextResponse.redirect(new URL("/profile", request.url));
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
