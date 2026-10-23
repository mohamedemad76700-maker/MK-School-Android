# Android release signing

Release signing reads these environment variables at build time:

- `MK_ANDROID_KEYSTORE_FILE`
- `MK_ANDROID_KEYSTORE_PASSWORD`
- `MK_ANDROID_KEY_ALIAS`
- `MK_ANDROID_KEY_PASSWORD`

Store the keystore outside the repository and provide the four values through a trusted local secret store or CI secret manager. Gradle rejects partial configuration. If the values are absent, it can still build unsigned artifacts for review, but those artifacts cannot be uploaded as a signed Play release.

Build the Play bundle with `gradlew.bat bundleRelease` from this directory after setting the secrets in the build environment. Verify the resulting `app/build/outputs/bundle/release/app-release.aab` signature before distribution.
