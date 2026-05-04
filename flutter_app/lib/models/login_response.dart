import 'package:json_annotation/json_annotation.dart';
import 'package:equatable/equatable.dart';

part 'login_response.g.dart';

@JsonSerializable()
class LoginResponse extends Equatable {
  final int id;
  final String email;
  final String role;
  final String token;
  final int? serviceId;
  final String? serviceNom;
  final int? poleId;
  final String? poleNom;
  final int? equipeId;
  final String? equipeNom;

  const LoginResponse({
    required this.id,
    required this.email,
    required this.role,
    required this.token,
    this.serviceId,
    this.serviceNom,
    this.poleId,
    this.poleNom,
    this.equipeId,
    this.equipeNom,
  });

  factory LoginResponse.fromJson(Map<String, dynamic> json) =>
      _$LoginResponseFromJson(json);

  Map<String, dynamic> toJson() => _$LoginResponseToJson(this);

  @override
  List<Object?> get props => [
    id,
    email,
    role,
    token,
    serviceId,
    serviceNom,
    poleId,
    poleNom,
    equipeId,
    equipeNom,
  ];
}
