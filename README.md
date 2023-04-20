# ipset-creator
Automatically fetch list of CIDRs by country and build ipset lists for filtering connections from those countries efficiently

This set of scripts will:

1. Fetch lists of CIDRs for various countries from https://github.com/herrbischoff/country-ip-blocks
2. Aggregate CIDR sets for continents
2. Build those into linux ipset commands for each country and each continent
3. Create those ipsets as `xyz-new` and then once fully created, swap them into `xyz`, and then delete `xyz-new`.  In this way, you can update a live running system with no downtime.

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
git clone https://github.com/herrbischoff/country-ip-blocks

# Optionally install systemd timer to refresh lists daily
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

You can actually load all the ipsets into the kernel by doing something like this:

```
cd /var/opt/ipset-creator
$(yarn global dir)/node_modules/ipset-creator/systemd-scripts/build-list-from-countries.sh # Build the lists
ipset restore -f <(ipset-creator) # for IPv4 lists
ipset restore -f <(ipset-creator -i6) # for IPv6 lists
```

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
UM
```

## Subsequent updating

After you have set up the ipsets and are using them in iptables, you do not want to just remove them, and ipset won't let you anyway.  What you want to do is load new ipsets, then use `ipset swap` to activate the new sets once they're fully loaded. This will prevent any problems where you temporary lower your shields during the update and suddenly the Russian spammers nuke you. To do this update, simply:

```
cd /var/opt/ipset-creator
$(yarn global dir)/node_modules/ipset-creator/systemd-scripts/build-list-from-countries.sh # Build the lists
ipset restore -f <(ipset-creator -r)
ipset restore -f <(ipset-creator -6 -r) # For IPv6 lists
```

the `-r` or `--replace-existing` will generate ipset commands to load everything and then swap for the existing sets, and then nuke those now-outdated sets after the swap.

*NOTE: if the original ipsets did not exist then this will fail and leave a bunch of XYZ-new ipsets in your kernel*
