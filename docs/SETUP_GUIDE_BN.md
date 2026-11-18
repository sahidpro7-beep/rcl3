# RCL 2027 (রঘুনাথপুর ক্রিকেট লিগ) — সুপাবেস (Supabase) এবং হোস্টিং সেটআপ গাইড

এই গাইডটি অনুসরণ করে আপনি কোনো জটিলতা ছাড়াই **RCL 2027 (Season 3)** ওয়েবসাইটের ব্যাকএন্ড, ডাটাবেস, স্টোরেজ এবং একক অ্যাডমিন প্যানেল সেটআপ করতে পারবেন।

> **গুরুত্বপূর্ণ:** আপনার মূল `tinbin.in` ওয়ার্ডপ্রেস ওয়েবসাইট, ডাটাবেস বা DNS-এ কোনো পরিবর্তন করা হবে না। আমরা কেবল `rcl.tinbin.in`-এর জন্য স্ট্যাটিক সাইট প্রস্তুত করছি।

---

## ধাপ ১: সুপাবেস (Supabase) প্রোজেক্ট তৈরি করা

1. ব্রাউজারে [https://supabase.com](https://supabase.com) ওপেন করে সাইন ইন করুন।
2. **"New Project"** বাটনে ক্লিক করুন।
3. প্রোজেক্টের নাম দিন: `rcl-2027`।
4. শক্তিশালী একটি ডাটাবেস পাসওয়ার্ড দিন (এটি কোথাও লিখে নিরাপদে রাখুন)।
5. রিজিয়ন (Region) হিসেবে **South Asia (Mumbai - ap-south-1)** সিলেক্ট করুন।
6. **"Create new project"** ক্লিক করে ১–২ মিনিট অপেক্ষা করুন।

---

## ধাপ ২: সঠিক ক্রমে SQL মাইগ্রেশন চালানো

সুপাবেস ড্যাশবোর্ডের বাম দিকের মেনু থেকে **SQL Editor** খুলুন এবং **"New query"**-তে গিয়ে নিচের ৫টি ফাইল **একটির পর একটি** ঠিক এই ক্রমে রান করুন:

1. প্রথমে `supabase/migrations/001_schema_and_constraints.sql` ফাইলের সম্পূর্ণ কোড কপি করে পেস্ট করুন ও **Run** চাপুন।
   - এতে সমস্ত টেবিল, `RCL27-0001` প্লেয়ার আইডি সিকোয়েন্স, সঠিক UPI আইডি (`9732865882@ybl`), সামির খানের নম্বর (`+91 8509044325`), ৫ নভেম্বর ২০২৬ খোলার তারিখ এবং ৬টি খালি টিম স্লট তৈরি হবে।
2. দ্বিতীয়ত `supabase/migrations/002_functions_and_triggers.sql` কপি করে পেস্ট করুন ও **Run** চাপুন।
   - এতে অ্যাডমিন যাচাই ফাংশন, সার্ভার-সাইড রেজিস্ট্রেশন উইন্ডো ফাংশন এবং পেমেন্ট যাচাই ছাড়া অ্যাপ্রুভাল আটকানোর ট্রিগার যুক্ত হবে।
3. তৃতীয়ত `supabase/migrations/003_rls_and_storage.sql` কপি করে পেস্ট করুন ও **Run** চাপুন।
   - এতে সমস্ত টেবিলে Row Level Security (RLS) এবং দুটি স্টোরেজ বাকেট (`rcl-private-uploads` ও `rcl-public-media`) তৈরি হবে।
4. চতুর্থত `supabase/migrations/004_past_champions_videos_social.sql` কপি করে পেস্ট করুন ও **Run** চাপুন।
   - এতে বিগত চ্যাম্পিয়ন (`2025: Ali Knight Rider`, `2026: SRCB`), ভিডিও গ্যালারির ৩টি ডিফল্ট ভিডিও এবং অফিশিয়াল সোশ্যাল লিংকসমূহ যুক্ত হবে (অন্য কোনো পুরোনো ডাটা মুছে ফেলা ছাড়াই)।
5. পঞ্চমত `supabase/migrations/005_video_gallery_facebook_first.sql` কপি করে পেস্ট করুন ও **Run** চাপুন।
   - এতে ভিডিও গ্যালারিতে প্রথমে Facebook ভিডিও এবং এরপর দুটি YouTube ভিডিও ক্রমানুসারে সেট হবে।

---

## ধাপ ৩: ফ্রন্টএন্ড এনভায়রনমেন্ট ভেরিয়েবল (.env) সেট করা

1. সুপাবেস ড্যাশবোর্ডে **Project Settings → API** (বা **Data API / API Keys**)-তে যান।
2. সেখান থেকে দুটি পাবলিক তথ্য কপি করুন:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public key**
3. আপনার প্রোজেক্ট ফোল্ডারের রুটে `.env` নামের একটি নতুন ফাইল তৈরি করুন (`.env.example` দেখে) এবং লিখুন:

```env
VITE_SUPABASE_URL=https://আপনার-প্রোজেক্ট-আইডি.supabase.co
VITE_SUPABASE_ANON_KEY=আপনার-anon-public-key
```

> **সতর্কতা:** কখনোই `service_role` কী বা ডাটাবেস পাসওয়ার্ড `.env` ফাইলের `VITE_*` ভেরিয়েবলে রাখবেন না।

---

## ধাপ ৪: সুপাবেস Edge Functions ডিপ্লয় করা

সার্ভার-সাইড নিরাপত্তা, ফাইল স্ক্যান, স্ট্যাটাস চেক, সংশোধন এবং অ্যাডমিন কাজের জন্য **Edge Functions** ডিপ্লয় করতে হবে।

1. আপনার কম্পিউটারে টার্মিনাল খুলে সুপাবেস CLI লগইন ও লিংক করুন:
   ```bash
   npx supabase login
   npx supabase link --project-ref আপনার-প্রোজেক্ট-রেফারেন্স-আইডি
   ```
2. এবার নিচের কমান্ডগুলো চালিয়ে ৬টি ফাংশন ডিপ্লয় করুন:
   ```bash
   npx supabase functions deploy public-data --no-verify-jwt
   npx supabase functions deploy upload-media --no-verify-jwt
   npx supabase functions deploy register-player --no-verify-jwt
   npx supabase functions deploy check-status --no-verify-jwt
   npx supabase functions deploy resubmit-application --no-verify-jwt
   npx supabase functions deploy admin-api --no-verify-jwt
   ```
   *(নোট: প্রতিটি ফাংশন কোডের ভেতরে নিজেই প্রয়োজনীয় অনুমোদন, রেট লিমিটিং এবং `admin-api`-তে JWT + `admin_users` টেবিল যাচাই করে নেয়।)*

---

## ধাপ ৫: একমাত্র প্রধান অ্যাডমিন (Main Admin) তৈরি ও অনুমোদন করা

নিরাপত্তার জন্য ওয়েবসাইটে কোনো পাবলিক অ্যাডমিন সাইন-আপ ফর্ম নেই এবং সোর্স কোডে কোনো পাসওয়ার্ড রাখা হয়নি। প্রধান অ্যাডমিন যুক্ত করতে:

1. সুপাবেস ড্যাশবোর্ডে **Authentication → Users** পাতায় যান।
2. **"Add user" → "Create new user"** ক্লিক করুন।
3. অ্যাডমিনের ইমেইল ও একটি শক্তিশালী পাসওয়ার্ড দিয়ে ইউজার তৈরি করুন (**Auto Confirm User** অন রাখুন)।
4. তৈরি হওয়া ইউজারের **User UID** (UUID) কপি করুন।
5. এবার **SQL Editor**-এ গিয়ে নিচের SQL-টি চালান (ইমেইল ও UID পরিবর্তন করে):
   ```sql
   INSERT INTO public.admin_users (user_id, email)
   VALUES ('এখানে-ইউজার-UID-বসান', 'admin-email@example.com');
   ```
6. ব্যস! এখন ওয়েবসাইটের `/admin` পাতায় গিয়ে ওই ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করা যাবে। অন্য কোনো সুপাবেস ইউজার লগইন করলেও অ্যাডমিন অ্যাক্সেস পাবে না।

---

## ধাপ ৬: লোকাল রান এবং প্রোডাকশন বিল্ড (Hostinger-এর জন্য)

1. লোকালভাবে ওয়েবসাইট চালিয়ে দেখার জন্য:
   ```bash
   npm install
   npm run dev
   ```
2. **Hostinger (`rcl.tinbin.in`)**-এ আপলোড করার জন্য স্ট্যাটিক বিল্ড তৈরি করতে:
   ```bash
   npm run build
   ```
3. বিল্ড শেষ হলে `dist/` ফোল্ডারের ভেতরের সমস্ত ফাইল (যার মধ্যে `.htaccess`-ও থাকবে) কেবল `rcl.tinbin.in`-এর `public_html` বা সাবডোমেইন ফোল্ডারে আপলোড করবেন।
   - **`tinbin.in`-এর WordPress ফাইল বা ডাটাবেস স্পর্শ করবেন না।**
   - `/register`, `/track`, `/players` এবং `/admin` রুটগুলো সরাসরি ব্রাউজারে রিফ্রেশ করলেও যেন কাজ করে, সেজন্য `public/.htaccess` ফাইলটি স্বয়ংক্রিয়ভাবে `dist/.htaccess`-এ কপি হয় (Apache/Hostinger-এর জন্য)। যদি Nginx ব্যবহার করেন, তবে `try_files $uri $uri/ /index.html;` যোগ করুন।

---

## ধাপ ৭: অ্যাডমিন প্যানেল থেকে চ্যাম্পিয়ন, ভিডিও ও সোশ্যাল লিংক আপডেট করা

1. ওয়েবসাইটের `/admin` রুটে লগইন করুন।
2. **Window & Settings** ট্যাবে যান:
   - WhatsApp Channel, Facebook Page এবং Instagram লিংক ডিফল্টভাবে সেট করা আছে; প্রয়োজনে যেকোনো সময় আপডেট করতে পারবেন।
   - **Replace Logo & Hero Banner** থেকে চাইলে নতুন লোগো বা হিরো ব্যানার আপলোড করুন।
   - প্রয়োজনে রেজিস্ট্রেশন খোলার বা বন্ধ করার তারিখ ও মোড (`Auto` / `Force Open` / `Force Closed`) পরিবর্তন করুন।
3. **Past Champions** ট্যাবে গিয়ে বিগত চ্যাম্পিয়ন দলের বছর, ইংরেজি ও বাংলা নাম এবং দলের লোগো পরিবর্তন করুন।
4. **Notices & Videos** ট্যাবে গিয়ে ঘোষণা/ফিক্সচার এবং ভিডিও গ্যালারির YouTube ও Facebook ভিডিও লিংক ও প্রদর্শনের ক্রম যোগ বা সম্পাদনা করুন।
