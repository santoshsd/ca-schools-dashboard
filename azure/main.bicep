@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Unique suffix for resource names')
param nameSuffix string = uniqueString(resourceGroup().id)

@description('Custom domain for the app')
param customDomain string = 'cadashboard.s13i.me'

@description('PostgreSQL admin username')
param dbAdminUser string = 'csdadmin'

@secure()
@description('PostgreSQL admin password')
param dbAdminPassword string

@secure()
@description('Session secret for Express sessions')
param sessionSecret string

// --- PostgreSQL Flexible Server ---
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: 'csd-pg-${nameSuffix}'
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: dbAdminUser
    administratorLoginPassword: dbAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgresServer
  name: 'cadashboard'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource postgresFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: postgresServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// --- App Service Plan ---
resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'csd-plan-${nameSuffix}'
  location: location
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  properties: {
    reserved: true
  }
}

// --- Container Registry ---
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: 'csdacr${nameSuffix}'
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// --- App Service (Web App for Containers) ---
resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: 'csd-app-${nameSuffix}'
  location: location
  kind: 'app,linux,container'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'DOCKER|${containerRegistry.properties.loginServer}/cadashboard:latest'
      alwaysOn: true
      healthCheckPath: '/api/health'
      appSettings: [
        {
          name: 'DATABASE_URL'
          value: 'postgresql://${dbAdminUser}:${dbAdminPassword}@${postgresServer.properties.fullyQualifiedDomainName}:5432/cadashboard?sslmode=require'
        }
        {
          name: 'SESSION_SECRET'
          value: sessionSecret
        }
        {
          name: 'PORT'
          value: '8080'
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'WEBSITES_PORT'
          value: '8080'
        }
        {
          name: 'DOCKER_REGISTRY_SERVER_URL'
          value: 'https://${containerRegistry.properties.loginServer}'
        }
        {
          name: 'DOCKER_REGISTRY_SERVER_USERNAME'
          value: containerRegistry.listCredentials().username
        }
        {
          name: 'DOCKER_REGISTRY_SERVER_PASSWORD'
          value: containerRegistry.listCredentials().passwords[0].value
        }
      ]
    }
    httpsOnly: true
  }
}

// --- Outputs ---
output appServiceUrl string = 'https://${webApp.properties.defaultHostName}'
output acrLoginServer string = containerRegistry.properties.loginServer
output acrName string = containerRegistry.name
output postgresHost string = postgresServer.properties.fullyQualifiedDomainName
output appServiceName string = webApp.name
output customDomainInstructions string = 'To add custom domain ${customDomain}: 1) Add CNAME record pointing to ${webApp.properties.defaultHostName}, 2) In Azure Portal go to App Service > Custom domains > Add custom domain, 3) Enable managed certificate for free SSL.'
