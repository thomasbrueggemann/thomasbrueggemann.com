FROM nginx
MAINTAINER Thomas Brüggemann <mail@thomasbrueggemann.com>
LABEL Description="thomasbrueggemann.com Website" Vendor="Thomas Brüggemann" Version="1.0.0"

COPY . /usr/share/nginx/html

EXPOSE 80
