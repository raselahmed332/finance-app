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

  private final Handler hideHandler = new Handler(Looper.getMainLooper());
  private final Runnable hideRunnable = this::enterImmersiveSticky;
  private boolean isPaused = false;
  private boolean pendingHideAfterReveal = false;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Hide system bars on initial launch
    enterImmersiveSticky();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(visibility -> {
        // When system bars are shown (visibility != 0), schedule re-hide in ~8s
        if ((visibility & View.SYSTEM_UI_FLAG_VISIBLE) != 0 || hasStatusOrNavVisible()) {
          scheduleHide(8000);
        }
      });
    } else {
      getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(visibility -> {
        if ((visibility & View.SYSTEM_UI_FLAG_HIDE_NAVIGATION) == 0) {
          scheduleHide(8000);
        }
      });
    }
  }

  @Override
  public void onResume() {
    super.onResume();
    isPaused = false;
    pendingHideAfterReveal = false;
    hideHandler.removeCallbacks(hideRunnable);
    enterImmersiveSticky();
  }

  @Override
  public void onPause() {
    super.onPause();
    isPaused = true;
    hideHandler.removeCallbacks(hideRunnable);
  }

  @Override
  public void onDestroy() {
    super.onDestroy();
    hideHandler.removeCallbacks(hideRunnable);
  }

  private boolean hasStatusOrNavVisible() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();
      if (insets == null) return false;
      boolean navVisible = insets.isVisible(WindowInsets.Type.navigationBars());
      boolean statusVisible = insets.isVisible(WindowInsets.Type.statusBars());
      return navVisible || statusVisible;
    }
    return false;
  }

  private void scheduleHide(long delayMs) {
    if (isPaused) {
      pendingHideAfterReveal = true;
      return;
    }
    hideHandler.removeCallbacks(hideRunnable);
    hideHandler.postDelayed(hideRunnable, delayMs);
  }

  private void enterImmersiveSticky() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      View decorView = getWindow().getDecorView();
      WindowInsetsController controller = decorView.getWindowInsetsController();
      if (controller != null) {
        controller.hide(WindowInsets.Type.navigationBars());
        controller.setSystemBarsBehavior(
          WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
      }
    } else {
      View decorView = getWindow().getDecorView();
      decorView.setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
          | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
          | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
          | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
          | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
          | View.SYSTEM_UI_FLAG_FULLSCREEN
      );
    }
  }
}
