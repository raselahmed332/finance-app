package com.amarhisab.app;

import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  // The system may auto-hide a swipe-revealed navigation bar sooner; this is an
  // upper bound so the bar cannot stay visible indefinitely after a gesture.
  private static final long REHIDE_DELAY_MS = 8000L;

  private final Handler hideHandler = new Handler(Looper.getMainLooper());
  private final Runnable hideRunnable = this::hideNavigationBar;
  private boolean isPaused = false;
  private boolean pendingHideAfterReveal = false;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(PdfSaverPlugin.class);
    super.onCreate(savedInstanceState);
    hideNavigationBar();
    installNavigationVisibilityListener();
  }

  @Override
  public void onResume() {
    super.onResume();
    isPaused = false;
    hideHandler.removeCallbacks(hideRunnable);
    hideNavigationBar();
    if (pendingHideAfterReveal) {
      pendingHideAfterReveal = false;
      scheduleHide(REHIDE_DELAY_MS);
    }
  }

  @Override
  public void onPause() {
    super.onPause();
    isPaused = true;
    hideHandler.removeCallbacks(hideRunnable);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    // Returning from a system dialog or another app must not leave the
    // navigation bar on screen.
    if (hasFocus) hideNavigationBar();
  }

  @Override
  public void onDestroy() {
    super.onDestroy();
    hideHandler.removeCallbacks(hideRunnable);
  }

  private void installNavigationVisibilityListener() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      getWindow().getDecorView().setOnApplyWindowInsetsListener((view, insets) -> {
        // A swipe (or a system dialog) can reveal the navigation bar. Keep the
        // status bar untouched; only schedule the navigation bar's re-hide.
        if (insets.isVisible(WindowInsets.Type.navigationBars())) {
          scheduleHide(REHIDE_DELAY_MS);
        }
        return view.onApplyWindowInsets(insets);
      });
      getWindow().getDecorView().requestApplyInsets();
    } else {
      getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(visibility -> {
        if ((visibility & View.SYSTEM_UI_FLAG_HIDE_NAVIGATION) == 0) {
          scheduleHide(REHIDE_DELAY_MS);
        }
      });
    }
  }

  private void scheduleHide(long delayMs) {
    if (isPaused) {
      pendingHideAfterReveal = true;
      return;
    }
    hideHandler.removeCallbacks(hideRunnable);
    hideHandler.postDelayed(hideRunnable, delayMs);
  }

  private void hideNavigationBar() {
    if (isPaused) return;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      View decorView = getWindow().getDecorView();
      WindowInsetsController controller = decorView.getWindowInsetsController();
      if (controller != null) {
        // The top status bar must stay visible at all times.
        controller.show(WindowInsets.Type.statusBars());
        controller.hide(WindowInsets.Type.navigationBars());
        controller.setSystemBarsBehavior(
          WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
      }
    } else {
      // Immersive-sticky for the navigation bar only. No FULLSCREEN or
      // LAYOUT_FULLSCREEN flags, so the status bar keeps its space and stays
      // visible on older Android versions too.
      getWindow().getDecorView().setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
          | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
          | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
          | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
      );
    }
  }
}
