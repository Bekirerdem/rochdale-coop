// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title EducationSBT — Eğitim Belgesi (Devredilemez)
/// @notice Rochdale 5. ilke: kooperatif üyelerine eğitim ve bilgilendirme sağlar.
/// @dev Devredilemez olması kasıtlıdır — bir üye bilgisini başkasına satamaz.
///      Bu belge, yönetişimde teklif verme hakkının ön koşuludur: kooperatifin
///      geleceğini şekillendirmek için önce onu anlamak gerekir.
contract EducationSBT {
    struct Credential {
        bytes32 course;      // keccak256("KOOPERATIFCILIK_101")
        string metadataURI;  // eğitim içeriği / sertifika
        uint256 issuedAt;
        bool revoked;
    }

    string public constant name = "Kooperatif Egitim Belgesi";
    string public constant symbol = "COOP-EDU";

    address public steward;
    bool public governanceLocked;

    mapping(address => bool) public issuers;
    mapping(address => Credential[]) private _credentials;
    mapping(address => mapping(bytes32 => bool)) public hasCourse;
    uint256 public totalIssued;

    event IssuerSet(address indexed issuer, bool allowed);
    event CredentialIssued(address indexed to, bytes32 indexed course, string metadataURI);
    event CredentialRevoked(address indexed holder, uint256 indexed index);
    event GovernanceLocked(address indexed governance);

    error OnlySteward();
    error OnlyIssuer();
    error AlreadyLocked();
    error ZeroAddress();
    error AlreadyHasCourse();
    error NoSuchCredential();
    error NonTransferable();

    modifier onlySteward() {
        if (msg.sender != steward) revert OnlySteward();
        _;
    }

    modifier onlyIssuer() {
        if (!issuers[msg.sender]) revert OnlyIssuer();
        _;
    }

    constructor(address _steward) {
        if (_steward == address(0)) revert ZeroAddress();
        steward = _steward;
        issuers[_steward] = true;
    }

    /// @dev Kilit sırasında kurucunun düzenleme yetkisi de alınır — belge basma
    ///      hakkı kalıcı olarak kooperatif kararına geçer.
    function lockGovernance(address governance) external onlySteward {
        if (governanceLocked) revert AlreadyLocked();
        if (governance == address(0)) revert ZeroAddress();
        issuers[steward] = false;
        steward = governance;
        issuers[governance] = true;
        governanceLocked = true;
        emit GovernanceLocked(governance);
    }

    function setIssuer(address issuer, bool allowed) external onlySteward {
        issuers[issuer] = allowed;
        emit IssuerSet(issuer, allowed);
    }

    function issue(address to, bytes32 course, string calldata metadataURI) external onlyIssuer {
        if (to == address(0)) revert ZeroAddress();
        if (hasCourse[to][course]) revert AlreadyHasCourse();

        _credentials[to].push(
            Credential({course: course, metadataURI: metadataURI, issuedAt: block.timestamp, revoked: false})
        );
        hasCourse[to][course] = true;
        totalIssued += 1;

        emit CredentialIssued(to, course, metadataURI);
    }

    function revoke(address holder, uint256 index) external onlySteward {
        if (index >= _credentials[holder].length) revert NoSuchCredential();
        Credential storage c = _credentials[holder][index];
        c.revoked = true;
        hasCourse[holder][c.course] = false;
        emit CredentialRevoked(holder, index);
    }

    /// @notice Üyenin geçerli en az bir eğitim belgesi var mı?
    function hasCredential(address account) external view returns (bool) {
        Credential[] storage list = _credentials[account];
        for (uint256 i = 0; i < list.length; i++) {
            if (!list[i].revoked) return true;
        }
        return false;
    }

    function credentialsOf(address account) external view returns (Credential[] memory) {
        return _credentials[account];
    }

    function credentialCount(address account) external view returns (uint256) {
        return _credentials[account].length;
    }

    /// @dev Devredilemezliğin açık beyanı: cüzdanlar ve arayüzler için.
    function transferFrom(address, address, uint256) external pure {
        revert NonTransferable();
    }
}
