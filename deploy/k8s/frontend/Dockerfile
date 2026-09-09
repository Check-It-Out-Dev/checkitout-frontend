# The frontend image: the browser bundle behind nginx. One image serves the kind cluster (deploy/k8s) and
# the sandbox (deploy/sandbox); the environment is chosen at start-up by two variables the official nginx
# image substitutes into default.conf.template (see that file).
# Built in the workflow AFTER the Angular build (production for kind, production,sandbox for the sandbox):
#   docker build -f deploy/k8s/frontend/Dockerfile -t checkitout-frontend:ci .
#   kind load docker-image checkitout-frontend:ci --name checkitout-ci
# The build itself stays outside the image so the runner's npm cache is reused.
FROM nginx:1.27-alpine
ENV BACKEND_UPSTREAM=backend.checkitout.svc:8080 \
    COOKIE_FLAGS="nosecure samesite=lax"
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/k8s/frontend/default.conf.template /etc/nginx/templates/default.conf.template
COPY dist/check-it-out-fe-greenfield/browser/ /usr/share/nginx/html/
EXPOSE 80
