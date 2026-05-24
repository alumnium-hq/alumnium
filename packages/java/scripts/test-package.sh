#!/usr/bin/env bash

# This script tests built Maven artifacts by emulating usage.

set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$PKG_DIR/test/maven"

ALUMNIUM_VERSION="$(grep "^version" "$PKG_DIR/build.gradle" | sed "s/.*= '//;s/'//")"

echo -e "🚧 Running Maven package tests...\n"

# 1. Detect the platform for CLI dependency resolution
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
linux) CLI_OS="linux" ;;
darwin) CLI_OS="darwin" ;;
*) echo "🔴 Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
x86_64 | amd64) CLI_ARCH="x64" ;;
aarch64 | arm64) CLI_ARCH="arm64" ;;
*) echo "🔴 Unsupported arch: $ARCH"; exit 1 ;;
esac

CLI_TARGET="${CLI_OS}-${CLI_ARCH}"

# 2. Install all alumnium artifacts (main + 6 CLI publications) to local Maven repo
echo -e "🌀 Publishing alumnium + CLI artifacts to local Maven repo\n"

cd "$PKG_DIR"
if gradle_output=$("$PKG_DIR/gradlew" --no-daemon publishToMavenLocal 2>&1); then
	echo "🟢 Publish OK: alumnium installed to local Maven repo"
else
	echo -e "🔴 Publish FAIL: './gradlew publishToMavenLocal' failed\n"
	echo "--- Output ------------------------------------------"
	echo "$gradle_output"
	echo "-----------------------------------------------------"
	exit 1
fi

# 3. Generate test build.gradle
cat >"$TEST_DIR/build.gradle" <<EOF
plugins {
    id 'java'
}

group = 'ai.alumnium.test'
version = '0.1.0'

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenLocal()
    mavenCentral()
}

dependencies {
    testImplementation 'ai.alumnium:alumnium:${ALUMNIUM_VERSION}'
    testRuntimeOnly 'ai.alumnium:alumnium-cli-${CLI_TARGET}:${ALUMNIUM_VERSION}'
    testImplementation 'com.microsoft.playwright:playwright:1.60.0'
    testImplementation 'org.junit.jupiter:junit-jupiter:5.11.4'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher'
    testRuntimeOnly 'org.slf4j:slf4j-simple:2.0.16'
}

tasks.register('installPlaywright', JavaExec) {
    classpath = sourceSets.test.runtimeClasspath
    mainClass = 'com.microsoft.playwright.CLI'
    args = ['install', 'chromium', '--with-deps']
}

tasks.withType(Test).configureEach {
    useJUnitPlatform()
    testLogging {
        events 'passed', 'skipped', 'failed'
        showExceptions true
        showStackTraces true
        showCauses true
    }
}
EOF

# 4. Install Playwright browser
echo -e "\n🌀 Installing Playwright browser\n"

cd "$TEST_DIR"
"$PKG_DIR/gradlew" --no-daemon installPlaywright -q 2>/dev/null || \
	echo "⚠️  Playwright browser install skipped (may already be installed)"

# 5. Run the smoke test
echo -e "\n🌀 Running Maven smoke test\n"

if test_output=$(ALUMNIUM_LOG_LEVEL=warning "$PKG_DIR/gradlew" --no-daemon test 2>&1); then
	echo "🟢 Test OK: Tests executed successfully"
else
	echo -e "🔴 Test FAIL: Smoke test failed\n"
	echo "--- Output ------------------------------------------"
	echo "$test_output"
	echo "-----------------------------------------------------"
	exit 1
fi

echo -e "\n🎉 All Maven package tests passed!\n"
