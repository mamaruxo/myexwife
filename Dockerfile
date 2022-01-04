FROM node:16.13.1 AS build
WORKDIR /code
COPY package.json yarn.lock ./
# hadolint ignore=DL3060
RUN yarn install --frozen-lockfile
COPY src ./src
COPY tsconfig.json ./
# we rerun install with the --prod flag to strip unneeded devDeps after our build is done.
# hadolint ignore=DL3060
RUN yarn build && yarn install --frozen-lockfile --production

FROM node:16.13.1
WORKDIR /code
# https://stackoverflow.com/questions/37458287/how-to-run-a-cron-job-inside-a-docker-container
# hadolint ignore=DL3008
RUN apt-get update && apt-get -qq --no-install-recommends install cron && apt-get clean && rm -rf /var/lib/apt/lists/*
COPY run.sh ./
COPY --from=build /code/node_modules ./node_modules
COPY --from=build /code/dist ./dist
ENV NODE_ENV=production
ENTRYPOINT ["bash", "run.sh"]
CMD ["yarn", "start"]
