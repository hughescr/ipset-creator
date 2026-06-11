# ipset-creator
Automatically maintain ipset lists by country and continent for efficient connection filtering

This set of scripts will:

1. Read CIDR blocks from a local clone of https://github.com/ipverse/country-ip-blocks (refreshed via `git pull` — no HTTP fetching at generation time)
2. Aggregate CIDR sets for continents
3. Build those into linux ipset commands for each country and each continent
4. Create those ipsets as `xyz-new` and then once fully created, swap them into `xyz`, and then delete `xyz-new`.  In this way, you can update a live running system with no downtime.

**Naming scope:** `ipset-creator.sh` considers kernel sets whose names match
`^([A-Z]{2}|africa|asia|europe|north-america|oceania|south-america)(-ipv6)?(-new)?$`
as belonging to it.  Do **not** create unrelated ipset names that match that pattern — the script will flush and destroy stale sets in that namespace during reconciliation.

## Installation

You can install on Ubuntu thus:

```
# Install nodejs and yarn
apt install nodejs
npm -g install yarn

# Install ipset-creator globally
yarn global add ipset-creator

# Now clone the repo of CIDR blocks into /var/opt
mkdir -p /var/opt/ipset-creator
cd /var/opt/ipset-creator
git clone https://github.com/ipverse/country-ip-blocks

# Optionally install systemd timer to refresh lists hourly
# This will automatically update the git repo in /var/opt/ipset-creator on a regular basis and
# load those updated lists into the kernel
ln -s $(yarn global dir)/node_modules/ipset-creator/systemd-scripts/ipset-creator.service /etc/systemd/system/
ln -s $(yarn global dir)/node_modules/ipset-creator/systemd-scripts/ipset-creator.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ipset-creator.timer

# Note that these commands above will not actually do any filtering based on the ipsets
# You will need to install iptables filters as detailed below if you want to do any filtering
```

## Manual runs

The recommended way to load (or refresh) all ipsets is to run the main script directly:

```
cd /var/opt/ipset-creator
sudo $(yarn global dir)/node_modules/ipset-creator/systemd-scripts/ipset-creator.sh
```

This script is resilient: it handles first runs, reboots (missing sets), new country codes appearing in the data, and stale country codes disappearing — all automatically.

Alternatively you can drive the raw generator yourself, but note this lacks the resilience handling (swap-target pre-creation, leftover cleanup, and stale-set reconciliation):

```
cd /var/opt/ipset-creator
$(yarn global dir)/node_modules/ipset-creator/systemd-scripts/update-country-data.sh  # Update the data repo
ipset restore -f <(ipset-creator -r)   # for IPv4 lists
ipset restore -f <(ipset-creator -6 -r) # for IPv6 lists
```

The `-r` / `--replace-existing` flag generates swap-based output so existing sets are replaced atomically.  If a set name does not yet exist in the kernel when you run `ipset restore`, you will need to pre-create it; the shell script handles this automatically.

The CLI reads CIDR data directly from `country-ip-blocks/country/*/aggregated.json` relative to the current working directory. No intermediate flat files are generated.

Then, once you have the ipsets in the kernel, you can use them for iptables chains, such as:

```
iptables -N LOG_AND_REJECT
iptables -N banned_email_senders
iptables -A LOG_AND_REJECT -m limit --limit 5/min -j LOG --log-prefix "reject bad guy: " --log-level 7 # Set up a rule to reject bad guys
iptables -A LOG_AND_REJECT -j REJECT --reject-with icmp-host-prohibited
iptables -A INPUT -p tcp -m tcp --dport 587 -j banned_email_senders # Apply filter chain for any connection attempt on port 587 for email submission
iptables -A banned_email_senders -m set --match-set DE src -j RETURN # Allow countries we know our users come from
iptables -A banned_email_senders -m set --match-set IT src -j RETURN
iptables -A banned_email_senders -m set --match-set SI src -j RETURN
iptables -A banned_email_senders -m set --match-set AT src -j RETURN
iptables -A banned_email_senders -m set --match-set RU src -j LOG_AND_REJECT # This would get rejected below anyway, but track stats via iptables for this one specifically
iptables -A banned_email_senders -m set --match-set europe src -j LOG_AND_REJECT # Ban everything else by continent
iptables -A banned_email_senders -m set --match-set asia src -j LOG_AND_REJECT
iptables -A banned_email_senders -m set --match-set africa src -j LOG_AND_REJECT
iptables -A banned_email_senders -m set --match-set north-america src -j LOG_AND_REJECT
iptables -A banned_email_senders -m set --match-set south-america src -j LOG_AND_REJECT
iptables -A banned_email_senders -m set --match-set oceania src -j LOG_AND_REJECT
```

```
ip6tables -N LOG_AND_REJECT
ip6tables -N banned_email_senders
ip6tables -A LOG_AND_REJECT -m limit --limit 5/min -j LOG --log-prefix "reject bad guy: " --log-level 7 # Set up a rule to reject bad guys
ip6tables -A LOG_AND_REJECT -j REJECT --reject-with icmp-host-prohibited
ip6tables -A INPUT -p tcp -m tcp --dport 587 -j banned_email_senders # Apply filter chain for any connection attempt on port 587 for email submission
ip6tables -A banned_email_senders -m set --match-set DE src -j RETURN # Allow countries we know our users come from
ip6tables -A banned_email_senders -m set --match-set IT src -j RETURN
ip6tables -A banned_email_senders -m set --match-set SI src -j RETURN
ip6tables -A banned_email_senders -m set --match-set AT src -j RETURN
ip6tables -A banned_email_senders -m set --match-set RU src -j LOG_AND_REJECT # This would get rejected below anyway, but track stats via ip6tables for this one specifically
ip6tables -A banned_email_senders -m set --match-set europe src -j LOG_AND_REJECT # Ban everything else by continent
ip6tables -A banned_email_senders -m set --match-set asia src -j LOG_AND_REJECT
ip6tables -A banned_email_senders -m set --match-set africa src -j LOG_AND_REJECT
ip6tables -A banned_email_senders -m set --match-set north-america src -j LOG_AND_REJECT
ip6tables -A banned_email_senders -m set --match-set south-america src -j LOG_AND_REJECT
ip6tables -A banned_email_senders -m set --match-set oceania src -j LOG_AND_REJECT
```

Note: In the above rules, we allow 4 specific european countries, and then ban everything else.  The four allowed countries will return, so it's fine that `europe` includes `DE`, `IT`, `SI`, and `AT` - those won't be rejected cos they were already accepted!

Note also: Some countries might be included in more than one continent - for example `RU` is in both `europe` and `asia`.  These countries are in more than one continent:

```
AM
AZ
CY
EG
GE
KZ
RU
TR
```

## Subsequent updating

After you have set up the ipsets and are using them in iptables, you do not want to just remove them, and ipset won't let you anyway.  What you want to do is load new ipsets, then use `ipset swap` to activate the new sets once they're fully loaded. This will prevent any problems where you temporary lower your shields during the update and suddenly the Russian spammers nuke you.

The simplest and most resilient way to update is to run the main script:

```
cd /var/opt/ipset-creator
sudo $(yarn global dir)/node_modules/ipset-creator/systemd-scripts/ipset-creator.sh
```

The script detects whether a refresh is needed (data changed upstream, or sets are missing after a reboot), always uses the swap path, and reconciles any stale sets left over from country codes that disappeared from the data.

## Migrating from herrbischoff/country-ip-blocks

If you have an existing installation that uses the old `herrbischoff/country-ip-blocks` data source, you must delete the old clone and re-clone from ipverse. A `git pull` against the old repo will **not** pick up the new source — the repositories have unrelated histories.

```
cd /var/opt/ipset-creator
rm -rf country-ip-blocks
git clone https://github.com/ipverse/country-ip-blocks
```

The following country codes existed as per-country ipsets in the old herrbischoff data but are **not present** in the ipverse dataset, so those ipsets will no longer be created or updated (both IPv4 and IPv6 sets existed for each):

- `AP` — generic "Asia-Pacific" code (the `asia` continent set previously included the AP ranges; those ranges are now absent from the data entirely)
- `ZZ` — unknown/unallocated

Codes such as `XK`, `EU`, `SJ`, `UM`, `EH`, `SH`, `TF`, `CC`, `CX`, `XD`, `XS`, `PN`, `XX` only appeared in the old `index.mjs` continent tables — they were never present in the herrbischoff data files, so no ipsets were ever created for them.  Nothing to clean up for these.

**The rewritten `ipset-creator.sh` reconciles all of this automatically**: after each refresh it flushes and destroys any kernel sets in its naming scope that are no longer produced by the generator.  A flush always succeeds (neutralising stale data even when the set is still referenced by an iptables rule); destroy succeeds once you remove the referencing rule.

If you prefer to clean up manually after migrating:

```
# Remove stale per-country sets (both IPv4 and IPv6 existed in old data)
for SET in AP ZZ AP-ipv6 ZZ-ipv6; do
    ipset flush "$SET" 2>/dev/null && ipset destroy "$SET" 2>/dev/null || true
done
```
