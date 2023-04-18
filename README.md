# ipset-creator
Automatically fetch list of CIDRs by country and build ipset lists for filtering connections from those countries efficiently

This set of scripts will:

1. Fetch lists of CIDRs for various countries from https://ipv4.fetus.jp/
2. Aggregate CIDR sets for continents
2. Build those into linux ipset commands for each country and each continent
3. Create those ipsets as `xyz-new` and then once fully created, swap them into `xyz`, and then delete `xyz-new`.  In this way, you can update a live running system with no downtime.

## Then what?

You can actually load all the ipsets into the kernel by doing something like this:

```
ipset restore -f <(node index.mjs)
```

Then, once you have the ipsets in the kernel, you can use them for iptables chains, such as:

```
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

## Details

The script fetches https://ipv4.fetus.jp/ipv4bycc-cidr.txt (which is a redirect to the most current list).  This list is refreshed every 24 hours with the latest RIR data.

See here for details about automated access to this data: https://ipv4.fetus.jp/about

