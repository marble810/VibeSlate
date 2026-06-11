FROM alpine:3.20

RUN apk add --no-cache fail2ban iptables bash

# Default config
COPY jail.d /etc/fail2ban/jail.d/
COPY filter.d /etc/fail2ban/filter.d/
COPY action.d /etc/fail2ban/action.d/

# Create log directory
RUN mkdir -p /var/log/marble-panel /var/log/caddy

# Start fail2ban in foreground
ENTRYPOINT ["fail2ban-server", "-f", "--async"]
