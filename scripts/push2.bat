@echo off
cd /d c:\Users\godmo\.augment\bytspot-beta
git add -A
git commit -m "legal: Add Disclaimer page + /disclaimer route + legal links in Profile"
git push --no-verify origin master:main 2>&1
echo DONE
