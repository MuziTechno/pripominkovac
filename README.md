# Poznámky a budík 0.1

Rozšiřitelný Android projekt pro proud poznámek s přesným budíkem.

## Hotovo ve verzi 0.1
- kompaktní pastelový proud poznámek
- místní ukládání, hledání, připnuté, koš
- úprava textu a termínu
- rychlé budíky 5/10/30 min a 1/2/3 hodiny
- přesný Android AlarmManager přes `setAlarmClock`
- celoobrazovkové zvonění, vibrace, vypnutí a odložení
- obnovení naplánovaných alarmů po restartu
- systémové sdílení a předvyplněný e-mail

## Otevření
1. Otevřete kořen projektu v Android Studio.
2. Nechte proběhnout Gradle Sync.
3. Spusťte modul `app` na Androidu 8+ (API 26+).

## Důležité pro Google Play
Projekt deklaruje `USE_EXACT_ALARM`, protože přesný budík je hlavní funkcí aplikace. Při publikaci je nutné tuto funkci správně uvést v Play Console. Celoobrazovkové alarmy je nutné otestovat na Androidu 14/15 a na konkrétním firemním telefonu.

## Co je záměrně připraveno na další verze
- fotografie a IndexedDB / nativní úložiště
- nastavení zvuku, velikosti písma a vzhledu
- opakované budíky
- přeplánování z obrazovky zvonění
- databázová vrstva Room namísto localStorage
