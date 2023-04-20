#!/usr/bin/env bash
git -C country-ip-blocks pull --all -p

grep -F '' country-ip-blocks/ipv4/* \
    | sed -e 's/^country-ip-blocks\/ipv4\///;s/.cidr:/\t/' \
    | tr '[:lower:]' '[:upper:]' \
    > sorted-from-git-ipv4.txt

grep -F '' country-ip-blocks/ipv6/* \
    | sed -e 's/^country-ip-blocks\/ipv6\///;s/.cidr:/\t/' \
    | tr '[:lower:]' '[:upper:]' \
    > sorted-from-git-ipv6.txt
