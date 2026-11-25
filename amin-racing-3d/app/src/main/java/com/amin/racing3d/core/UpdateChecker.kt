package com.amin.racing3d.core

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL

/**
 * Checks the game's GitHub releases for a newer published version.
 *
 * Only runs when the device has an internet connection. It reads the public releases list of
 * the repository (no account or token needed), keeps published `amin-racing-v*` releases (drafts
 * and pre-releases are skipped) and compares the highest version with the installed one.
 * Nothing is downloaded or installed automatically: the player decides in a dialog.
 */
object UpdateChecker {
    const val OWNER = "amingangmanatgh2-hash"
    const val REPO = "gaming-hub"
    const val TAG_PREFIX = "amin-racing-v"
    private const val API = "https://api.github.com/repos/$OWNER/$REPO/releases?per_page=30"
    const val RELEASES_PAGE = "https://github.com/$OWNER/$REPO/releases"

    /** the "new version" dialog was shown in this app process */
    @Volatile var dialogShown = false

    const val CHECKING = 0
    const val OFFLINE = 1
    const val UP_TO_DATE = 2
    const val AVAILABLE = 3
    const val FAILED = 4

    class Result(
        val state: Int,
        val current: String,
        val latest: String? = null,
        /** release page of the newer version */
        val pageUrl: String? = null,
        /** direct link of the release APK asset, if the release has one */
        val apkUrl: String? = null,
        /** first part of the release notes */
        val notes: String? = null
    )

    /** Installed version without build-type suffixes ("2.0.0-debug" -> "2.0.0"). */
    fun installedVersion(ctx: Context): String {
        val name = try {
            ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "0"
        } catch (e: Exception) {
            "0"
        }
        return name.substringBefore('-').trim()
    }

    fun isOnline(ctx: Context): Boolean {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    /** Compares dotted versions numerically: 1.10.0 > 1.9.2. */
    fun compare(a: String, b: String): Int {
        val pa = a.split('.').map { it.filter(Char::isDigit).toIntOrNull() ?: 0 }
        val pb = b.split('.').map { it.filter(Char::isDigit).toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val x = pa.getOrElse(i) { 0 }
            val y = pb.getOrElse(i) { 0 }
            if (x != y) return x.compareTo(y)
        }
        return 0
    }

    /** Runs the check on a background thread and reports on the main thread. */
    fun check(ctx: Context, onResult: (Result) -> Unit) {
        val app = ctx.applicationContext
        val current = installedVersion(app)
        val main = Handler(Looper.getMainLooper())
        if (!isOnline(app)) {
            main.post { onResult(Result(OFFLINE, current)) }
            return
        }
        val t = Thread {
            val r = try {
                query(current)
            } catch (e: Exception) {
                Result(FAILED, current)
            }
            main.post { onResult(r) }
        }
        t.isDaemon = true
        t.name = "update-check"
        t.start()
    }

    private fun query(current: String): Result {
        val conn = URL(API).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 6000
            conn.readTimeout = 8000
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
            conn.setRequestProperty("User-Agent", "AminRacing3D/$current")
            if (conn.responseCode != 200) return Result(FAILED, current)
            val body = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            val arr = JSONArray(body)
            var bestVer: String? = null
            var bestPage: String? = null
            var bestApk: String? = null
            var bestNotes: String? = null
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                if (o.optBoolean("draft") || o.optBoolean("prerelease")) continue
                val tag = o.optString("tag_name")
                if (!tag.startsWith(TAG_PREFIX)) continue
                val ver = tag.removePrefix(TAG_PREFIX)
                if (ver.isEmpty() || !ver[0].isDigit()) continue
                if (bestVer != null && compare(ver, bestVer) <= 0) continue
                bestVer = ver
                bestPage = o.optString("html_url").ifEmpty { RELEASES_PAGE }
                bestNotes = o.optString("body").trim().take(420).ifEmpty { null }
                bestApk = null
                val assets = o.optJSONArray("assets")
                if (assets != null) for (k in 0 until assets.length()) {
                    val a = assets.getJSONObject(k)
                    if (a.optString("name").endsWith("-release.apk")) bestApk = a.optString("browser_download_url")
                }
            }
            if (bestVer == null || compare(bestVer, current) <= 0) return Result(UP_TO_DATE, current, bestVer)
            return Result(AVAILABLE, current, bestVer, bestPage, bestApk, bestNotes)
        } finally {
            conn.disconnect()
        }
    }
}
