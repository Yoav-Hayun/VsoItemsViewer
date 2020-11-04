import * as vscode from 'vscode';

let organizationUrlPrefix: string = "https://dev.azure.com/";
let organizationUrlSuffix: string = "{organization}";

export const AzureAccessTokenInfoLink: string = "https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate";

export const Settings = {
    AzureOrganizationUrl : 'vsoitems.OrganizationUrl',
    AzureAccessToken : 'vsoitems.AzureAccessToken'
};

export const InputBoxOptions: Record<any , vscode.InputBoxOptions>= {
    AzureOrganizationUrl : {
        value: organizationUrlPrefix + organizationUrlSuffix,
        valueSelection: [organizationUrlPrefix.length, -1],
        prompt: "Organization URL"
    },
    AzureAccessToken : {
        prompt: "Access Token. [ " + AzureAccessTokenInfoLink + " ]"
    },
};

export const VsoItemFields = {
    Title : 'System.Title',
    Type : 'System.WorkItemType',
    State: 'System.State'
};

export const TypeIcons: {[type: string] : string} = {
    'Bug' : 'icon_bug.svg',
    'Task': 'icon_task.svg',
    'Task Group': 'icon_task_group.svg',
    'Product Backlog Item': 'icon_backlog_item.svg',
    'Feature': 'icon_feature.svg',
    'Initiative': 'icon_initiative.svg',
    'User Story' : 'icon_user_story.svg'
};