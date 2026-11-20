# Nahrání a sestavení přes GitHub

1. Na GitHubu vytvořte nový soukromý repozitář `nezapomen-android`.
2. Nerozbalený ZIP nelze použít přímo. Rozbalte projekt a nahrajte obsah složky, nikoli nadřazenou složku.
3. Po nahrání otevřete kartu **Actions** a workflow **Build Android 0.1**.
4. Sestavení se spustí automaticky po nahrání do větve `main`. Případně zvolte **Run workflow**.
5. Po dokončení otevřete běh workflow a v části **Artifacts** stáhněte `nezapomen-0.1-debug-apk`.

Debug APK slouží pro ověření sestavení. Pro instalaci přes Google Play bude následovat podepsaný AAB.
