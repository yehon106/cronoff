# Optional log in and Google log in (by yehon106)

Log in is optional: nobody has to. An account lets you save your tabs online and open them on another device. The **Log in** button only shows when you finish the steps below.
Cronoff does not count or track anything.

## 1. A free database (10 minutes)

1. Vercel, your project, **Storage**, **Create Database**, choose **Upstash for Redis** (free plan). Connect it to your Cronoff project (tick Production).
   Vercel adds the database variables for you (names ending in `REST_API_URL` and `REST_API_TOKEN`; any prefix works).
2. Settings, Environment Variables, add `SESSION_SECRET` = a long random text (30+ characters, never share it).
3. Deployments, **Redeploy**.
4. Open `https://YOUR-SITE/api/auth`. You should see `{"ready":true,"user":null}`. If it says `"ready":false`, the `why` line tells you what is missing.

## 2. Continue with Google (optional, 15 minutes)

Cronoff only asks Google for the person's **name**, never their email.
1. https://console.cloud.google.com, create a project.
2. **APIs & Services**, **OAuth consent screen** (or **Google Auth Platform**): External, app name `Cronoff`, your email as support and developer contact, save. Press **Publish app** (in "Testing" only listed test users can sign in).
3. **Credentials**, **Create credentials**, **OAuth client ID**, **Web application**. Under **Authorized redirect URIs** add exactly `https://YOUR-SITE/api/google` (no slash at the end; add every address you use).
4. Copy the Client ID and secret into Vercel as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then Redeploy.
5. Open Log in: **Continue with Google** is there. "redirect_uri_mismatch" means the address in step 3 is not exactly the one in your browser bar.

## Safety

Passwords are stored only as scrypt hashes. The login cookie is HttpOnly. Wrong guesses are rate limited. If you lose `SESSION_SECRET`, everyone is just logged out.
