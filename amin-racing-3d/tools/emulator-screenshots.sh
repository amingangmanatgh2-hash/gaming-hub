#!/usr/bin/env bash
# Installs the debug APK on a running emulator, drives the game through its debug-only
# demo intents and captures real screenshots + logcat.
#   usage: tools/emulator-screenshots.sh <debug.apk> <output-dir>
set -u
APK="$1"
OUT="$2"
mkdir -p "$OUT"
PKG=com.amin.racing3d.debug
ACT="$PKG/com.amin.racing3d.MainActivity"

adb wait-for-device
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 1
adb install -r -g "$APK" || { echo "install failed"; exit 1; }
adb logcat -c

shot() {
  adb exec-out screencap -p > "$OUT/$1.png"
  echo "captured $1 ($(stat -c %s "$OUT/$1.png") bytes)"
}
alive() {
  if ! adb shell pidof "$PKG" >/dev/null; then
    echo "::error::app process not running after step $1"
    adb logcat -d > "$OUT/logcat.txt"
    return 1
  fi
}
demo() {
  # $1 = seconds to wait, rest = extras
  local wait="$1"; shift
  adb shell am start -n "$ACT" "$@" >/dev/null
  sleep "$wait"
}

# ---------------------------------------------------------------- portrait, Persian
adb shell am start -W -n "$ACT"
sleep 70
shot 01-main-menu-fa
alive menu || exit 1

demo 8 --es demo garage --ei car 3
shot 02-garage-supercar

demo 6 --es demo upgrades
shot 03-upgrade-shop

demo 6 --es demo modes
shot 04-mode-select

demo 6 --es demo race --ei mode 1 --ei env 0 --ei tod 0 --ei car 0 --ei gfx 1 --ez autogas true --ei control 1 --ez fps true
shot 05-race-countdown-city
sleep 16
shot 06-race-city-two-way
alive race-city || exit 1

demo 55 --es demo race --ei mode 0 --ei env 1 --ei tod 1 --ei car 1 --ei gfx 1 --ez autogas true --ei control 1 --ez fps false
shot 07-race-desert-sunset

demo 55 --es demo race --ei mode 2 --ei env 2 --ei tod 0 --ei car 2 --ei gfx 1 --ez autogas true --ei control 1
shot 08-race-snow-time-attack

demo 55 --es demo race --ei mode 1 --ei env 3 --ei tod 2 --ei car 3 --ei gfx 1 --ez autogas true --ei control 1
shot 09-race-forest-night
# keep driving straight with auto-gas until a crash ends the run
sleep 40
shot 10-game-over
alive gameplay || exit 1

demo 8 --es demo pause --ei mode 1 --ei env 0 --ei tod 1 --ez autogas true --ei control 1
sleep 3
shot 11-pause

# ---------------------------------------------------------------- landscape
sleep 4
demo 55 --es demo race --ei mode 1 --ei env 0 --ei tod 2 --ei car 3 --ei gfx 1 --ez autogas true --ei control 1
shot 12-landscape-city-night
demo 7 --es demo garage --ei car 1
shot 13-landscape-garage
sleep 4

# ---------------------------------------------------------------- v2 modes + weather
demo 6 --es demo race --ei mode 3 --ei env 0 --ei tod 0 --ei weather 2 --ei car 5 --ei gfx 2 --ez autogas true --ei control 1
sleep 18
shot 16-street-race-heavy-rain
alive street || exit 1

demo 6 --es demo race --ei mode 6 --ei env 5 --ei tod 2 --ei weather 5 --ei car 1 --ei gfx 2 --ez autogas true --ei control 1
sleep 24
shot 17-police-chase-industrial-storm
alive police || exit 1

demo 6 --es demo race --ei mode 8 --ei env 4 --ei tod 1 --ei weather 0 --ei car 3 --ei gfx 2 --ez autogas true --ei control 1
sleep 26
shot 18-free-roam-coast-sunset
alive freeroam || exit 1

demo 6 --es demo race --ei mode 5 --ei env 6 --ei tod 0 --ei weather 3 --ei car 7 --ei gfx 2 --ez autogas true --ei control 1
sleep 16
shot 19-time-trial-mountain-snow

demo 6 --es demo race --ei mode 4 --ei env 3 --ei tod 0 --ei weather 4 --ei car 9 --ei gfx 2 --ez autogas true --ei control 1
sleep 14
shot 20-drift-forest-fog
alive drift || exit 1

demo 7 --es demo modes
shot 21-mode-select-weather

demo 7 --es demo story
shot 22-story-map

demo 8 --es demo dialogue --ei mission 3
shot 23-story-dialogue
alive story || exit 1

demo 6 --es demo mission --ei mission 1 --ei car 0 --ei gfx 2 --ez autogas true --ei control 1
sleep 30
shot 24-story-mission-hud
alive mission || exit 1

# ---------------------------------------------------------------- v2 progression + Garage 2.0
demo 7 --es demo progress --ei tab 0
shot 25-progress-daily
demo 7 --es demo progress --ei tab 1
shot 26-progress-achievements
alive progress || exit 1

# sports car: chrome finish, turbine rims in gold, blue calipers, dark tint, cyan neon, red interior
demo 8 --es demo customize --ei car 0 --ei gfx 2 --es custom "3,1,2,2,0,2,2,0,1"
shot 27-garage-customize
# muscle car (no factory wing): GT wing, matte finish, deep dish rims
demo 8 --es demo customize --ei car 1 --ei gfx 2 --es custom "2,2,1,1,2,1,3,2,2"
shot 28-garage-customize-wing
# customised car in a night race (neon, wing, hot brakes)
demo 6 --es demo race --ei mode 0 --ei env 0 --ei tod 2 --ei weather 0 --ei car 1 --ei gfx 2 --ez autogas true --ei control 1
sleep 38
shot 29-custom-car-night-race
alive garage2 || exit 1

# ---------------------------------------------------------------- v2.0: new cars, taxi, on foot, phone
demo 8 --es demo garage --ei car 10 --ei gfx 2
shot 30-car-rally-hatch
demo 8 --es demo garage --ei car 11 --ei gfx 2
shot 31-car-electric-gt
demo 8 --es demo garage --ei car 12 --ei gfx 2
shot 32-car-taxi
demo 8 --es demo garage --ei car 13 --ei gfx 2
shot 33-car-drift-coupe
alive newcars || exit 1

demo 30 --es demo taxi --ei stage 1 --ei mode 0 --ei env 0 --ei tod 0 --ei weather 0 --ei car 12 --ei gfx 2 --ez autogas false --ei control 1 --ei after 1500
shot 34-taxi-passenger-waiting
demo 32 --es demo taxi --ei stage 2 --ei mode 0 --ei env 0 --ei tod 1 --ei weather 0 --ei car 12 --ei gfx 2 --ez autogas true --ei control 1 --ei after 800
shot 35-taxi-ride-hud
alive taxi || exit 1

demo 30 --es demo onfoot --ei mode 8 --ei env 0 --ei tod 0 --ei weather 0 --ei car 11 --ei gfx 2 --ez autogas false --ei control 1 --ei after 1000
shot 36-free-roam-on-foot
alive onfoot || exit 1

demo 46 --es demo phone --ei app 0 --ei stage 1 --ei mode 0 --ei env 0 --ei tod 2 --ei car 13 --ei gfx 2 --ez autogas true --ei control 1 --ei after 1800
shot 37-phone-home
demo 38 --es demo phone --ei app 1 --ei stage 2 --ei mode 0 --ei env 0 --ei tod 0 --ei car 13 --ei gfx 2 --ez autogas true --ei control 1 --ei after 1800
shot 38-phone-map
demo 38 --es demo phone --ei app 2 --ei stage 2 --ei mode 0 --ei env 0 --ei tod 0 --ei car 12 --ei gfx 2 --ez autogas true --ei control 1 --ei after 1800
shot 39-phone-taxi
demo 38 --es demo phone --ei app 6 --ei mode 8 --ei env 1 --ei tod 1 --ei car 10 --ei gfx 2 --ez autogas true --ei control 1 --ei after 1800
shot 40-phone-radio
demo 34 --es demo photo --ei mode 8 --ei env 0 --ei tod 1 --ei weather 0 --ei car 11 --ei gfx 2 --ez autogas false --ei control 1 --ei after 800
shot 41-photo-mode
alive phone || exit 1

demo 7 --es demo menu
shot 42-main-menu-v2

# ---------------------------------------------------------------- v2.1: shop, controls, Low preset, roads
demo 8 --es demo garage --ei sort 0 --ei view 4 --ei coins 9500
shot 43-shop-cheapest-first
demo 8 --es demo garage --ei sort 2 --ei view 9 --ei coins 9500
shot 44-shop-performance-locked
demo 6 --es demo controls --ei control 2
shot 45-controls-settings
demo 6 --es demo hudlayout --ei control 2
shot 46-hud-layout-editor
alive v21-ui || exit 1
demo 30 --es demo race --ei mode 4 --ei env 0 --ei tod 0 --ei weather 0 --ei car 13 --ei gfx 2 --ez autogas true --ei control 2 --ez fps true
shot 47-drift-wheel-handbrake
demo 32 --es demo race --ei mode 8 --ei env 0 --ei tod 0 --ei weather 0 --ei car 0 --ei gfx 0 --ez autogas true --ei control 1 --ez fps true
shot 48-low-preset-city-dev-overlay
demo 32 --es demo race --ei mode 8 --ei env 0 --ei tod 0 --ei weather 0 --ei car 0 --ei gfx 2 --ez autogas true --ei control 1 --ez fps true
shot 49-high-preset-city-sidewalks
demo 32 --es demo race --ei mode 8 --ei env 5 --ei tod 1 --ei weather 1 --ei car 5 --ei gfx 1 --ez autogas true --ei control 1 --ez fps true
shot 50-medium-industrial-rain-asphalt
alive v21-race || exit 1

# ---------------------------------------------------------------- English UI (fresh launch)
adb shell am force-stop "$PKG"
sleep 1
adb shell am start -n "$ACT" --es demo settings --es lang en >/dev/null
sleep 70
shot 14-settings-english
demo 6 --es demo scores
shot 15-scoreboard-english
alive english || exit 1

adb logcat -d > "$OUT/logcat.txt"
adb logcat -d -s AndroidRuntime:E AminGL:* > "$OUT/errors.txt" || true
if grep -q "FATAL EXCEPTION" "$OUT/logcat.txt"; then
  echo "::error::FATAL EXCEPTION found in logcat"
  grep -A25 "FATAL EXCEPTION" "$OUT/logcat.txt" | head -60
  exit 1
fi
echo "emulator run finished OK"
