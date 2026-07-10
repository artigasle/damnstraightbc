# 728 AMS Damn Straight Booster Club — Store

A storefront site for GitHub Pages. Visitors browse merch, build a cart, and
submit an order (which emails you and saves to an admin dashboard). You manage
inventory, orders, and see sales analytics from a password-protected admin page.

Because GitHub Pages only serves static files (no server, no database of its
own), this site uses **Firebase** (Google's free-tier backend) to store
inventory and orders so they sync between you and every visitor. Firebase's
free "Spark" plan comfortably covers a booster club store — you will not be
billed unless you manually upgrade.

Two pages:
- `index.html` — the public store
- `admin.html` — your dashboard (inventory, orders, analytics, settings)

---

## 1. Create your Firebase project (~10 minutes, one time)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with any Google account.
2. Click **Add project**, name it something like `728ams-booster-store`, and finish the wizard (you can decline Google Analytics).
3. In the left sidebar, click **Build > Firestore Database > Create database**. Choose a region close to you, and start in **production mode**.
4. Click the **Rules** tab inside Firestore and replace the contents with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /items/{itemId} {
         allow read: if true;
         allow write: if request.auth != null;
       }
       match /orders/{orderId} {
         allow create: if true;
         allow read, update, delete: if request.auth != null;
       }
       match /config/{docId} {
         allow read: if true;
         allow write: if request.auth != null;
       }
     }
   }
   ```

   This means: anyone can view items and place an order, but only a signed-in
   admin can edit inventory, view/update orders, or change settings. Click **Publish**.

5. In the left sidebar, click **Build > Authentication > Get started**. Enable the
   **Email/Password** sign-in method.
6. Still in Authentication, go to the **Users** tab and click **Add user**. Enter
   the email and password you (the admin) want to log in with. This is your
   admin login for `admin.html` — you can add more admin users the same way later.
7. In the left sidebar, click the gear icon > **Project settings**. Scroll to
   **Your apps**, click the **`</>`** (web) icon, give it any nickname, and skip
   Firebase Hosting (you're using GitHub Pages instead). Copy the `firebaseConfig`
   object it shows you.
8. Open `js/firebase-config.js` in this project and paste your values in,
   replacing the placeholders.

That's it for backend setup — no billing info required.

---

## 2. Put your store's items in

Once deployed (step 3 below), go to `yoursite.com/admin.html`, sign in with the
admin account you created, and use **Add item** to start listing merch — name,
description, price, your cost (used for profit tracking), stock count, and a
photo. Also go to the **Settings** tab and enter the email address you want
order notifications sent to.

---

## 3. Deploy to GitHub Pages

1. Create a new GitHub repository and push everything in this folder to it
   (keep the folder structure as-is — `index.html` and `admin.html` at the root,
   `css/` and `js/` as subfolders).
2. In the repo, go to **Settings > Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch,"
   pick your main branch and the `/ (root)` folder, then save.
4. GitHub will give you a URL like `https://yourusername.github.io/yourrepo/`
   within a minute or two. That's your live store; add `/admin.html` for the
   dashboard.

---

## How it works day to day

- **Visitors** browse the store, add items to their cart ("load manifest"),
  and submit an order. That order is saved to your Firestore database
  immediately, stock is deducted automatically, and the visitor's email app
  opens with a pre-filled message addressed to the admin email you set —
  so you get notified even if you're not staring at the dashboard.
- **You (admin)** check the **Current Orders** tab, see new orders come in in
  real time, and click **Mark complete** once it's paid and handed off.
- **Analytics** tab shows order count, items sold, revenue, cost of goods,
  and profit — with a toggle for "completed orders only" vs. "all orders,"
  and a per-item breakdown table.

## Notes & things worth knowing

- **Stock is reserved at order time**, not at "mark complete" time — this
  avoids two people ordering the last item at once. If an order gets
  cancelled and you want the stock back, just edit the item's stock count
  in Inventory.
- **Photos** are compressed in the visitor's/your browser and stored directly
  in the database (not Firebase Storage), which keeps everything on the free
  tier. This works well for product photos but isn't meant for huge, high-res
  images — the compression step keeps file sizes reasonable automatically.
- **Admin login** uses real Firebase Authentication, not a hardcoded password
  in the code, so it's meaningfully secure. Add teammates as admins from
  Firebase Console > Authentication > Users.
- **The "email" is a `mailto:` link**, not a server-sent email — it opens
  whatever email app is set as default on the visitor's device. If they don't
  have one configured, nothing opens, which is why every order is also saved
  in the admin dashboard regardless.
- Want to change colors, fonts, or the squadron name/branding? Everything
  visual lives in `css/style.css` (see the `:root` variables at the top) and
  the header markup in `index.html` / `admin.html`.
