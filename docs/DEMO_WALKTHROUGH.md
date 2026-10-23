# Demonstration walkthrough

Requires a dedicated, configured Supabase project. These steps are not evidence of completed hosted testing.

1. Register and confirm one Admin and two test Creators. Bootstrap only the Admin UUID with the trusted SQL procedure in SETUP.
2. Admin → Sample project templates. Open Birthday, Unboxing or Hindi Voice Over. All start as DRAFT with [SAMPLE] in the title, explicit sample terms and zero payment. Choose one, replace the amount/terms with agreed test values, and create it. No user, earning or transaction is fabricated.
3. Open Explore projects as Admin. Open the draft, upload a sample image/reference and publish. Creators should now see it; unassigned creators must not see the private script.
4. Creator A applies. Try applying twice; duplicate prevention should reject the second attempt. Creator B must not see A's application.
5. Admin reviews and approves A. A sees the script/assignment and agreed payment. Approving beyond capacity must fail.
6. For a product: A enters delivery details, Admin records dispatch, A confirms receipt. B must not see A's address.
7. A uploads a recording/video. Admin requests a revision with instructions. A uploads a new version; both versions remain in history.
8. Admin approves the latest version. A's approved earnings appear, with payment pending. They must not appear as already paid.
9. To demonstrate status without transferring money, use PROCESSING. Only choose PAID after a real authorized external transfer, using its actual reference. Do not invent a transaction for the demo.
10. Read notifications and review Operations history. Suspend B and verify B cannot access workflow records or mutate data; reactivate B.
11. Test on Android/iPhone widths, keyboard navigation, email recovery, expired sessions, upload failures and another creator's file URLs before launch.

Samples are normal persisted projects created only when the Admin submits the form. Remove or archive sample briefs before real business use.
