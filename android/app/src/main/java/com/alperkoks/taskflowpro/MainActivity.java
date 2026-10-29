package com.alperkoks.taskflowpro;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Android pencere, statusBar, navBar ve DecorView zemin rengini obsidian siyaha (#070b14) bağla
        if (getWindow() != null) {
            if (getWindow().getDecorView() != null) {
                getWindow().getDecorView().setBackgroundColor(Color.parseColor("#070b14"));
            }
            getWindow().setStatusBarColor(Color.parseColor("#070b14"));
            getWindow().setNavigationBarColor(Color.parseColor("#070b14"));
        }

        // 2. WebView zeminini obsidian siyaha sabitle ve overscroll sıçramasını önle
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setBackgroundColor(Color.parseColor("#070b14"));
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            webView.post(() -> {
                View parent = (View) webView.getParent();
                if (parent != null) {
                    parent.setBackgroundColor(Color.parseColor("#070b14"));
                }
            });
        }

        // 3. Android 13/14/15+ Yeni Donanım & Jest / Kenardan Kaydırma Geri Tuşu Yönetimi
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                        "if (typeof handleNativeHardwareBackButton === 'function') { handleNativeHardwareBackButton(); } else { window.history.back(); }",
                        null
                    );
                }
            }
        });
    }

    // Eski Android sürümleri için yedek onBackPressed
    @Override
    public void onBackPressed() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(
                "if (typeof handleNativeHardwareBackButton === 'function') { handleNativeHardwareBackButton(); } else { window.history.back(); }",
                null
            );
        } else {
            super.onBackPressed();
        }
    }
}
