const base = process.env.APP_URL ?? "http://localhost:3000";
const email = process.env.OWNER_EMAIL;
const password = process.env.OWNER_PASSWORD;

if (!email || !password) {
  console.error("OWNER_EMAIL / OWNER_PASSWORD belum diisi");
  process.exit(1);
}

const loginPage = await fetch(`${base}/login`);
const html = await loginPage.text();
const action = html.match(/name="(\$ACTION_ID_[^"]+)"/)?.[1];
if (!action) {
  console.error("Action ID login tidak ditemukan");
  process.exit(1);
}

const form = new FormData();
form.append(action, "");
form.append("email", email);
form.append("password", password);
form.append("next", "/dashboard");

const response = await fetch(`${base}/login`, {
  method: "POST",
  body: form,
  redirect: "manual",
  headers: { Referer: `${base}/login` },
});

const cookies = response.headers.getSetCookie?.() ?? [];
const session = cookies.find((cookie) => cookie.startsWith("km_session="));
console.log(`login POST: HTTP ${response.status}`);
console.log(`session cookie: ${session ? "ADA" : "TIDAK ADA"}`);

if (session) {
  const cookie = session.split(";")[0];
  const dashboard = await fetch(`${base}/dashboard`, {
    headers: { cookie },
    redirect: "manual",
  });
  const body = await dashboard.text();
  console.log(`dashboard dengan sesi: HTTP ${dashboard.status}`);
  console.log(`konten dashboard: ${/Dashboard/.test(body) ? "OK" : "TIDAK"}`);
}
