# hydra-consent-app-express

This is an exemplary consent application that implements ORY Hydra's consent flow. It uses NodeJS and express.

# DEV

Build image : docker build -t hydra-consent-mock .  
Launch : docker run -d \  
  --name ory-hydra-mock-consent \  
  -p 9020:3000 \  
  -e HYDRA_CLIENT_ID=consent-app \  
  -e HYDRA_CLIENT_SECRET=consent-secret \  
  -e HYDRA_URL=https://ory-hydra-example--hydra:4444 \  
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \  
hydra-consent-mock
