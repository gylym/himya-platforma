export function learningApi(store) {
  const requireCloud = () => {
    if (store.mode !== "supabase")
      throw new Error("Бұл әрекет үшін Supabase бапталуы қажет.");
  };
  const auth = async () => {
    requireCloud();
    const s = await store.validSession();
    if (!s) throw new Error("Алдымен жүйеге кіріңіз");
    return s;
  };
  const redirect = () => new URL("./", document.baseURI).href;
  return {
    async callback() {
      if (store.mode !== "supabase") return;
      const params = new URLSearchParams(location.hash.slice(1));
      if (params.has("error_description")) {
        history.replaceState({}, "", location.pathname);
        throw new Error(
          "Растау сілтемесінің мерзімі аяқталған немесе ол жарамсыз. Жаңа сілтеме сұраңыз.",
        );
      }
      if (!params.has("access_token")) return;
      const token = params.get("access_token"),
        refresh = params.get("refresh_token"),
        recovery = params.get("type") === "recovery";
      // Remove credentials from the address bar before making a request.
      history.replaceState(
        {},
        "",
        new URL(recovery ? "./reset-password" : "./kabinet", document.baseURI)
          .pathname,
      );
      const user = await store.request("/auth/v1/user", {
        headers: store.headers(token),
      });
      if (!refresh) throw new Error("Сілтеме жарамсыз. Қайта кіріңіз.");
      ++store.authVersion;
      store.saveSession({
        access_token: token,
        refresh_token: refresh,
        user,
        expires_at:
          Math.floor(Date.now() / 1000) +
          Number(params.get("expires_in") || 3600),
      });
    },
    async recover(email) {
      requireCloud();
      await store.request(
        "/auth/v1/recover?redirect_to=" + encodeURIComponent(redirect()),
        {
          method: "POST",
          headers: store.headers(null),
          body: JSON.stringify({ email }),
        },
      );
    },
    async resend(email) {
      requireCloud();
      await store.request(
        "/auth/v1/resend?redirect_to=" + encodeURIComponent(redirect()),
        {
          method: "POST",
          headers: store.headers(null),
          body: JSON.stringify({ type: "signup", email }),
        },
      );
    },
    async password(password) {
      const s = await auth();
      await store.request("/auth/v1/user", {
        method: "PUT",
        headers: store.headers(s.access_token),
        body: JSON.stringify({ password }),
      });
    },
    async profile(display_name) {
      const s = await auth();
      const name = display_name.trim();
      if (!name || name.length > 100)
        throw new Error("Аты-жөні 1–100 таңба болуы керек");
      const rows = await store.request(
        "/rest/v1/profiles?id=eq." + encodeURIComponent(s.user.id),
        {
          method: "PATCH",
          headers: store.headers(s.access_token, {
            Prefer: "return=representation",
          }),
          body: JSON.stringify({ display_name: name }),
        },
      );
      if (!rows?.length) throw new Error("Профиль сақталмады");
      return rows[0];
    },
    async results() {
      const s = await auth();
      return store.request(
        "/rest/v1/game_results?user_id=eq." +
          encodeURIComponent(s.user.id) +
          "&select=*&order=created_at.desc&limit=100",
        { headers: store.headers(s.access_token) },
      );
    },
    async save(id, level, answers) {
      const s = await auth();
      return store.request("/rest/v1/rpc/submit_redox_game", {
        method: "POST",
        headers: store.headers(s.access_token),
        body: JSON.stringify({ p_id: id, p_level: level, p_answers: answers }),
      });
    },
  };
}
