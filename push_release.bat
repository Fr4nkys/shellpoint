@echo off
cd /d C:\Users\aldel\Desktop\CHKPUTY
git add -A
git commit -m "Release v1.0.9"
git tag -a v1.0.9 -m "v1.0.9"
git push origin main --tags
echo Done.
pause
