package ir.amin.chessai;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // همه منطق بازی در نسخه وب (www/) اجرا می‌شود؛
        // موتور Stockfish داخل WebWorker اندروید کار می‌کند.
    }
}
