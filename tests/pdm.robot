*** Settings ***
Library    SSHLibrary
Library    String

*** Variables ***
${IMAGE_URL}         ghcr.io/platypuschan/proxmox-datacenter-manager:latest
# The update scenario starts from the last published stable release of this
# module; test-module-update.sh looks it up in the registry.
${PREVIOUS_IMAGE_URL}    ${EMPTY}
${SCENARIO}          install
${HOST}              pdm.test
${module_id}         ${EMPTY}
${web_port}          ${EMPTY}
${ADMIN_USER}        admin
${ADMIN_PASSWORD}    Nethesis,1234
${PDM_PASSWORD}      ci-first-Password-1
${PDM_PASSWORD_2}    ci-second-Password-2

*** Keywords ***
Login to cluster-admin
    New Page    https://${NODE_ADDR}/cluster-admin/
    Fill Text    text="Username"    ${ADMIN_USER}
    Click    button >> text="Continue"
    Fill Text    text="Password"    ${ADMIN_PASSWORD}
    Click    button >> text="Log in"
    Wait For Elements State    css=#main-content    visible    timeout=10s

Read allocated web port
    ${port} =    Execute Command    runagent -m ${module_id} printenv TCP_PORT
    ${port} =    Strip String    ${port}
    Should Match Regexp    ${port}    ^[0-9]+$
    Set Suite Variable    ${web_port}    ${port}

PDM answers on its loopback port
    ${output}    ${rc} =    Execute Command    curl -ksS --max-time 5 -o /dev/null -w '\%{http_code}' https://127.0.0.1:${web_port}/
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0
    Should Be Equal    ${output}    200

Wait until PDM is up
    Wait Until Keyword Succeeds    180 seconds    3 seconds    PDM answers on its loopback port

Login status
    [Arguments]    ${password}    ${base}=https://127.0.0.1:${web_port}    ${extra}=
    ${payload} =    Evaluate    json.dumps({"username": "root@pam", "password": $password})    modules=json
    ${output}    ${rc} =    Execute Command    curl -ksS --max-time 10 ${extra} -o /dev/null -w '\%{http_code}' -H 'Content-Type: application/json' -d '${payload}' ${base}/api2/json/access/ticket
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0
    RETURN    ${output}

Configure module
    [Arguments]    ${password}
    ${payload} =    Evaluate    json.dumps({"host": $HOST, "http2https": False, "lets_encrypt": False, "admin_password": $password})    modules=json
    ${output}    ${rc} =    Execute Command    api-cli run module/${module_id}/configure-module --data '${payload}'
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0    configure-module failed: ${output}

*** Test Cases ***
Add module for ${SCENARIO} scenario
    IF    r'${SCENARIO}' == 'update'
        Set Local Variable    ${install_image}    ${PREVIOUS_IMAGE_URL}
    ELSE
        Set Local Variable    ${install_image}    ${IMAGE_URL}
    END
    ${output}    ${rc} =    Execute Command    add-module ${install_image} 1
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0    add-module ${install_image} failed: ${output}
    &{output} =    Evaluate    ast.literal_eval(r"""${output}""")    modules=ast
    Set Suite Variable    ${module_id}    ${output.module_id}

First configuration needs an administrator password
    ${payload} =    Evaluate    json.dumps({"host": $HOST, "http2https": False, "lets_encrypt": False})    modules=json
    ${output}    ${rc} =    Execute Command    api-cli run module/${module_id}/configure-module --data '${payload}'
    ...    return_rc=True
    Should Not Be Equal As Integers    ${rc}    0
    ${payload} =    Evaluate    json.dumps({"host": $HOST, "http2https": False, "lets_encrypt": False, "admin_password": "short"})    modules=json
    ${output}    ${rc} =    Execute Command    api-cli run module/${module_id}/configure-module --data '${payload}'
    ...    return_rc=True
    Should Not Be Equal As Integers    ${rc}    0

Configure initial module
    Configure module    ${PDM_PASSWORD}
    Read allocated web port
    Wait until PDM is up

Update module from the previous release
    Skip If    r'${SCENARIO}' != 'update'    only the update scenario updates the module
    Log    Scenario ${SCENARIO} with ${IMAGE_URL}    console=${True}
    ${output}    ${rc} =    Execute Command    api-cli run update-module --data '{"module_url":"${IMAGE_URL}","instances":["${module_id}"]}'
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0    update-module ${IMAGE_URL} failed: ${output}
    ${journal} =    Execute Command    journalctl -q --no-pager SYSLOG_IDENTIFIER=agent@${module_id}
    Should Not Contain    ${journal}    has failed    an update-module.d step failed
    Wait until PDM is up

Administrator login works and a wrong password is refused
    ${code} =    Login status    ${PDM_PASSWORD}
    Should Be Equal    ${code}    200
    ${code} =    Login status    not-the-password
    Should Be Equal    ${code}    401

Password is stored only as a hash
    ${mode} =    Execute Command    runagent -m ${module_id} stat -c '%a' admin.env
    ${mode} =    Strip String    ${mode}
    Should Be Equal    ${mode}    600
    ${content} =    Execute Command    runagent -m ${module_id} cat admin.env
    Should Contain    ${content}    PASSWORD_HASH=$6$
    Should Not Contain    ${content}    ${PDM_PASSWORD}
    ${output}    ${rc} =    Execute Command    api-cli run module/${module_id}/get-configuration
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0
    Should Match Regexp    ${output}    "admin_password_set":\\s*true
    Should Not Contain    ${output}    ${PDM_PASSWORD}
    Should Not Contain    ${output}    $6$

Check the application image
    ${version} =    Execute Command    runagent -m ${module_id} podman exec pdm cat /etc/pdm-version
    ${version} =    Strip String    ${version}
    Should Match Regexp    ${version}    ^[0-9]+[.][0-9]+[.][0-9]+$
    ${image} =    Execute Command    runagent -m ${module_id} printenv PDM_APP_IMAGE
    Should Contain    ${image}    /pdm-app:
    ${postfix} =    Execute Command    runagent -m ${module_id} podman exec pdm sh -c 'command -v postfix || echo none'
    Should Contain    ${postfix}    none

Check the container is rootless and bound to loopback
    ${bind} =    Execute Command    runagent -m ${module_id} podman port pdm
    Should Contain    ${bind}    127.0.0.1:${web_port}
    ${mounts} =    Execute Command    runagent -m ${module_id} podman inspect pdm --format '{{range .Mounts}}{{.Destination}} {{end}}'
    Should Contain    ${mounts}    /etc/proxmox-datacenter-manager
    Should Contain    ${mounts}    /var/lib/proxmox-datacenter-manager

Check the route through Traefik
    ${code} =    Login status    ${PDM_PASSWORD}    http://${HOST}    --resolve ${HOST}:80:127.0.0.1
    Should Be Equal    ${code}    200
    ${output}    ${rc} =    Execute Command    curl -ksS --max-time 10 --resolve ${HOST}:80:127.0.0.1 http://${HOST}/
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0
    Should Contain    ${output}    Proxmox Datacenter Manager

Keep the password when configuring without one
    Configure module    ${EMPTY}
    Wait until PDM is up
    ${code} =    Login status    ${PDM_PASSWORD}
    Should Be Equal    ${code}    200

Change the password
    Configure module    ${PDM_PASSWORD_2}
    Wait until PDM is up
    ${code} =    Login status    ${PDM_PASSWORD_2}
    Should Be Equal    ${code}    200
    ${code} =    Login status    ${PDM_PASSWORD}
    Should Be Equal    ${code}    401

Data survives a service restart
    ${rc} =    Execute Command    runagent -m ${module_id} sh -c 'systemctl --user restart pdm.service'
    ...    return_rc=True    return_stdout=False
    Should Be Equal As Integers    ${rc}    0
    Wait until PDM is up
    ${code} =    Login status    ${PDM_PASSWORD_2}
    Should Be Equal    ${code}    200
    ${volumes} =    Execute Command    runagent -m ${module_id} podman volume ls --format '{{.Name}}'
    Should Contain    ${volumes}    pdm-config
    Should Contain    ${volumes}    pdm-data

Backup includes cover the state
    ${include} =    Execute Command    runagent -m ${module_id} sh -c 'cat ../etc/state-include.conf'
    Should Contain    ${include}    volumes/pdm-config
    Should Contain    ${include}    volumes/pdm-data
    Should Contain    ${include}    state/admin.env

Module UI loads in cluster-admin
    [Tags]    ui
    Import Library    Browser
    New Browser    chromium    headless=True
    New Context    ignoreHTTPSErrors=True
    Login to cluster-admin
    Go To    https://${NODE_ADDR}/cluster-admin/#/apps/${module_id}
    Wait For Elements State    iframe >>> h2 >> text="Status"    visible    timeout=20s
    Take Screenshot    filename=${OUTPUT DIR}/browser/screenshot/1._Status.png
    Go To    https://${NODE_ADDR}/cluster-admin/#/apps/${module_id}?page=settings
    Wait For Elements State    iframe >>> h2 >> text="Settings"    visible    timeout=20s
    # The heading renders even when module tasks fail; the host field is only
    # enabled and filled after get-configuration has completed
    Wait For Elements State    iframe >>> input[placeholder="pdm.example.org"]    enabled    timeout=30s
    Get Property    iframe >>> input[placeholder="pdm.example.org"]    value    ==    ${HOST}
    Take Screenshot    filename=${OUTPUT DIR}/browser/screenshot/2._Settings.png
    Close Browser

Remove module
    ${rc} =    Execute Command    remove-module --no-preserve ${module_id}
    ...    return_rc=True    return_stdout=False
    Should Be Equal As Integers    ${rc}    0
