$cp = Get-Content "D:\学习资料\暑期实训\Smart-Smoke-Detection-System111\classpath.txt" -Raw
& "C:\Users\潘宇星\.jdks\ms-17.0.19\bin\java.exe" -XX:TieredStopAtLevel=1 -Dspring.output.ansi.enabled=always -Dfile.encoding=UTF-8 -classpath $cp com.smartsmoke.SmartSmokeApplication
