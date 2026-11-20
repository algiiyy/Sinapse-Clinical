# Security Specification — SYNAPSE Clinical Firestore

## 1. Data Invariants
1. Every document in `clinicians/{uid}` belongs strictly to the authenticated user (`uid == request.auth.uid`), with verified email (`request.auth.token.email_verified == true`).
2. Every document in `patientConfigs`, `screeningReports`, `prescriptions`, and `aiAnalyses` must carry `ownerUid == request.auth.uid` on creation and can only be read, listed, updated, or deleted by its owner.
3. Timestamps (`createdAt`, `updatedAt`) are strictly enforced to equal `request.time` on creation/update, and `createdAt` and `ownerUid` are immutable after creation.
4. Clinical audit logs (`screeningReports`, `prescriptions`, `aiAnalyses`) are immutable once created (`allow update: if false`).
5. All string fields enforce strict `.size()` bounds and all IDs match `^[a-zA-Z0-9_\-]+$`.
6. Bounded array `actionableRecommendations` in `aiAnalyses` is strictly limited to `<= 5` items with string check on index 0.

## 2. Dirty Dozen Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. Unauthenticated read/write to `/patientConfigs/{docId}` or `/screeningReports/{docId}`.
2. Creating a `clinicians/{otherUid}` document where `uid != request.auth.uid`.
3. Creating a `patientConfigs` document with `ownerUid: "attacker_uid"` instead of `request.auth.uid`.
4. Injecting a shadow/ghost field (`isAdmin: true` or `isVerified: true`) into `clinicians`, `patientConfigs`, `screeningReports`, `prescriptions`, or `aiAnalyses`.
5. Spoofing client timestamp (`createdAt: Timestamp(2020-01-01)`) instead of `request.time`.
6. Updating `patientConfigs` while changing `ownerUid` or `createdAt` (immutable fields).
7. Updating `patientConfigs` with an unallowed field (`mrn` or `deviceId`) outside `affectedKeys().hasOnly(['targetRom', 'ashworthScore', 'ashworthNumeric', 'updatedAt'])`.
8. Attempting to mutate an immutable `screeningReports` or `prescriptions` record via `update`.
9. Injecting a 10KB string into `clinicalNote`, `patientNote`, or `docId` (resource poisoning).
10. Submitting an invalid `intensity` enum value outside the 4 clinical modes on `prescriptions`.
11. Listing `screeningReports` or `prescriptions` without a query filter matching `ownerUid == request.auth.uid`.
12. Passing an unbounded array (`actionableRecommendations` with 20 elements) or non-string array element into `aiAnalyses`.
