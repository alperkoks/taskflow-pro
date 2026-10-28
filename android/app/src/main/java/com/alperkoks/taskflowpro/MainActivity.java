package com.alperkoks.taskflowpro;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Android WebView ve pencere zeminini derin obsidian siyaha (#070b14) kilitle
        if (getWindow() != null && getWindow().getDecorView() != null) {
            getWindow().getDecorView().setBackgroundColor(Color.parseColor("#070b14"));
        }

        // 2. Android 15+ Edge-to-Edge ve Klavye çift inset çakışmasını (gri yarım ekran hatası) engelle
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setBackgroundColor(Color.parseColor("#070b14"));
            webView.post(() -> {
                View parent = (View) webView.getParent();
                if (parent != null) {
                    parent.setBackgroundColor(Color.parseColor("#070b14"));
                    ViewCompat.setOnApplyWindowInsetsListener(parent, (v, insets) -> {
                        v.setPadding(0, 0, 0, 0);
                        return insets;
                    });
                    webView.requestApplyInsets();
                }
            });
        }
    }

    // 3. Android Donanım / Hareket Geri Tuşu (Uygulamadan çat diye çıkmayı önler, ana ekrana veya açık modala döner)
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
