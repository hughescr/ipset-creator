#!/usr/bin/env bash
# Check if git remote has changes
git -C country-ip-blocks remote update

LOCAL=$(git -C country-ip-blocks rev-parse '@{0}')
REMOTE=$(git -C country-ip-blocks rev-parse '@{u}')

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "Up-to-date"
    exit 0
else
    echo "Diverged"
    git -C country-ip-blocks pull --all -p

    grep -F '' country-ip-blocks/ipv4/* \
        | sed -e 's/^country-ip-blocks\/ipv4\///;s/.cidr:/\t/' \
        | tr '[:lower:]' '[:upper:]' \
        > sorted-from-git-ipv4.txt

    grep -F '' country-ip-blocks/ipv6/* \
        | sed -e 's/^country-ip-blocks\/ipv6\///;s/.cidr:/\t/' \
        | tr '[:lower:]' '[:upper:]' \
        > sorted-from-git-ipv6.txt
    exit 1
fi
