package com.pocketcode.app

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Оболочка вокруг движка PocketCode, который крутится в Termux.
 * Пока демон не поднят — показываем родной экран с кнопкой запуска,
 * как только отвечает — отдаём экран приложению.
 */
class MainActivity : AppCompatActivity() {

    private val url = "http://127.0.0.1:4848"
    private lateinit var web: WebView
    private lateinit var gate: LinearLayout
    private lateinit var note: TextView
    private val main = Handler(Looper.getMainLooper())
    private var loaded = false
    private var polling = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            setBackgroundColor(Color.BLACK)
            overScrollMode = View.OVER_SCROLL_NEVER
            isFocusable = true
            isFocusableInTouchMode = true
            settings.setSupportZoom(false)
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(v: WebView?, code: Int, d: String?, u: String?) {
                    showGate("Lost the engine. Is Termux still running?")
                }
            }
            visibility = View.GONE
        }
        root.addView(web, ViewGroup.LayoutParams(-1, -1))

        gate = buildGate()
        root.addView(gate, ViewGroup.LayoutParams(-1, -1))

        setContentView(root)
        poll()
    }

    /** родной экран ожидания */
    private fun buildGate(): LinearLayout {
        val pad = (20 * resources.displayMetrics.density).toInt()
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.BLACK)
            setPadding(pad, pad, pad, pad)

            addView(TextView(this@MainActivity).apply {
                text = "POCKETCODE"
                setTextColor(Color.WHITE)
                textSize = 22f
                letterSpacing = 0.22f
                gravity = Gravity.CENTER
            })

            note = TextView(this@MainActivity).apply {
                text = "Looking for the engine…"
                setTextColor(Color.parseColor("#8E8E99"))
                textSize = 15f
                gravity = Gravity.CENTER
                setPadding(0, pad, 0, pad)
            }
            addView(note)

            addView(Button(this@MainActivity).apply {
                text = "Start it in Termux"
                setOnClickListener { startEngine() }
            })

            addView(TextView(this@MainActivity).apply {
                text = "First time? In Termux run:\n\nnpm i -g github:alishergiyasov100-boop/pocketcode\npocketcode"
                setTextColor(Color.parseColor("#5A5A66"))
                textSize = 12f
                gravity = Gravity.CENTER
                setPadding(0, pad, 0, 0)
            })
        }
    }

    private fun showGate(message: String) {
        main.post {
            note.text = message
            gate.visibility = View.VISIBLE
            web.visibility = View.GONE
            loaded = false
            poll()
        }
    }

    /** просим Termux поднять движок */
    private fun startEngine() {
        note.text = "Asking Termux to start it…"
        try {
            val i = Intent().apply {
                setClassName("com.termux", "com.termux.app.RunCommandService")
                action = "com.termux.RUN_COMMAND"
                putExtra("com.termux.RUN_COMMAND_PATH", "/data/data/com.termux/files/usr/bin/bash")
                putExtra("com.termux.RUN_COMMAND_ARGUMENTS", arrayOf("-lc", "pocketcode start"))
                putExtra("com.termux.RUN_COMMAND_WORKDIR", "/data/data/com.termux/files/home")
                putExtra("com.termux.RUN_COMMAND_BACKGROUND", true)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(i) else startService(i)
        } catch (e: Exception) {
            note.text = "Termux said no. Open Termux and run: pocketcode"
        }
    }

    /** ждём, пока демон ответит, и открываем приложение */
    private fun poll() {
        if (polling) return
        polling = true
        thread {
            while (!loaded) {
                val up = ping()
                if (up) {
                    main.post {
                        loaded = true
                        gate.visibility = View.GONE
                        web.visibility = View.VISIBLE
                        web.loadUrl(url)
                        web.requestFocus()
                    }
                    break
                }
                Thread.sleep(1500)
            }
            polling = false
        }
    }

    private fun ping(): Boolean = try {
        val c = URL("$url/api/status").openConnection() as HttpURLConnection
        c.connectTimeout = 1200
        c.readTimeout = 1200
        val ok = c.responseCode == 200
        c.disconnect()
        ok
    } catch (e: Exception) { false }

    override fun onBackPressed() {
        if (loaded && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onResume() {
        super.onResume()
        if (!loaded) poll()
    }
}
