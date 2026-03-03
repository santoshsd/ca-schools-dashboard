@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Unique suffix for resource names')
param nameSuffix string = uniqueString(resourceGroup().id)

@description('PostgreSQL admin username')
param dbAdminUser string = 'csdadmin'

@secure()
@description('PostgreSQL admin password')
param dbAdminPassword string

@secure()
@description('Session secret for Express sessions')
param sessionSecret string

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

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'csd-plan-${nameSuffix}'
  location: location
  kind: 'linux'
  sku: {
    name: 'F1'
    tier: 'Free'
  }
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: 'csd-app-${nameSuffix}'
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: false
      healthCheckPath: '/api/health'
      appCommandLine: 'node dist/index.cjs'
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
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
      ]
    }
    httpsOnly: true
  }
}

output appServiceUrl string = 'https://${webApp.properties.defaultHostName}'
output appServiceName string = webApp.name
output postgresHost string = postgresServer.properties.fullyQualifiedDomainName
output resourceGroup string = resourceGroup().name
