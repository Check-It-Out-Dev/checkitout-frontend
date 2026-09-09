# The frontend image for the kind cluster: the browser bundle of the production build behind nginx.
# Built in the workflow AFTER `npm run build` (the default, production configuration):
#   docker build -f deploy/k8s/frontend/Dockerfile -t checkitout-frontend:ci .
#   kind load docker-image checkitout-frontend:ci --name checkitout-ci
# The build itself stays outside the image so the runner's npm cache is reused.
FROM nginx:1.27-alpine
COPY deploy/k8s/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/check-it-out-fe-greenfield/browser/ /usr/share/nginx/html/
EXPOSE 80
