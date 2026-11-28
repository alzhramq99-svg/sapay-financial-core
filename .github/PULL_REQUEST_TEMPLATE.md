## Summary
<!-- What changed, and why? Keep the scope focused on the existing SApay project. -->

## Scope and beta safety
- [ ] This change extends the existing SApay project; it does not introduce a replacement app.
- [ ] The beta remains simulated: no real funds are accepted and no real transfers are performed.
- [ ] No credentials, private keys, certificates, provisioning profiles, invite codes, or personal data are included.
- [ ] No production/staging deployment, merge, signed release, or TestFlight upload is being performed by this PR.

## Verification
- [ ] Relevant checks and their results are listed below.
- [ ] Database or ledger changes include isolated integration coverage.
- [ ] iOS/Capacitor changes use the existing web interface and configured HTTPS demo API.
- [ ] Any device-only checks are clearly marked as pending unless run on a physical device.

**Checks and results**
<!-- Include command/workflow link and pass/fail result. Do not paste secrets or private tester data. -->

## iPhone acceptance (if relevant)
- [ ] Tested on a physical iPhone; model and iOS version are recorded.
- [ ] Login/registration, navigation, safe areas, and logout were checked.
- [ ] Face ID success, cancellation, and password fallback were checked when native iOS changed.
- [ ] Remaining device checks are listed as pending.

## Release gates
- [ ] A signed IPA is not described as installable until signing and device installation are confirmed.
- [ ] TestFlight upload remains a separately approved action.
- [ ] Apple membership, App Store Connect record, bundle ID, certificate, and provisioning profile are confirmed before a release attempt.

**Outstanding risks or follow-up**
<!-- Be explicit about what is not verified. -->
